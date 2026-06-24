CREATE OR REPLACE FUNCTION public.lifecycle_evaluate_onboarding_activation(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  a          public.onboarding_applications%ROWTYPE;
  v_flag     boolean;
  v_gates    jsonb;
  v_all_pass boolean;
  v_approve  jsonb;
BEGIN
  SELECT * INTO a FROM public.onboarding_applications WHERE id = p_application_id;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Onboarding application not found: %', p_application_id;
  END IF;

  IF NOT public.user_has_organization_access(a.organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization' USING ERRCODE='42501';
  END IF;

  v_flag     := public.is_canonical_lifecycle_enabled(a.organization_id);
  v_gates    := public.lifecycle_onboarding_gates(p_application_id);
  v_all_pass := COALESCE((v_gates->>'all_pass')::boolean, false);

  IF NOT v_flag THEN
    RETURN jsonb_build_object('mode', 'dry_run', 'flag', false,
                              'would_activate', v_all_pass, 'gates', v_gates);
  END IF;

  IF a.status IN ('approved','rejected','cancelled') THEN
    RETURN jsonb_build_object('mode', 'noop_closed', 'status', a.status, 'gates', v_gates);
  END IF;

  IF NOT v_all_pass THEN
    UPDATE public.onboarding_applications
       SET status = 'for_review',
           review_feedback = COALESCE(review_feedback, '') ||
             CASE WHEN COALESCE(review_feedback,'') = '' THEN '' ELSE E'\n' END ||
             'Auto-evaluation outstanding gates: ' || (v_gates->>'outstanding'),
           updated_at = now()
     WHERE id = p_application_id;
    RETURN jsonb_build_object('mode', 'routed_to_review', 'gates', v_gates);
  END IF;

  IF a.application_type = 'company' AND a.company_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.accountant_client_links
      WHERE practice_id = a.organization_id AND company_id = a.company_id AND status = 'active'
    ) THEN
      INSERT INTO public.accountant_client_links (practice_id, company_id, status, initiated_by, activated_at)
      VALUES (a.organization_id, a.company_id, 'active', 'practice', now());
    END IF;
  ELSIF a.client_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.accountant_client_links
      WHERE practice_id = a.organization_id AND client_id = a.client_id AND status = 'active'
    ) THEN
      INSERT INTO public.accountant_client_links (practice_id, client_id, status, initiated_by, activated_at)
      VALUES (a.organization_id, a.client_id, 'active', 'practice', now());
    END IF;
  END IF;

  v_approve := public.lifecycle_approve_onboarding(p_application_id);

  RETURN jsonb_build_object('mode', 'activated', 'gates', v_gates, 'approve', v_approve);
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_evaluate_onboarding_activation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_evaluate_onboarding_activation(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.lifecycle_evaluate_onboarding_activation(uuid) IS
  'Sprint 1: flag-aware onboarding activation evaluator. Org-access gated (members only). Flag OFF => dry-run, no writes. Flag ON => activate (link + delegate to approve) when gates pass, else route to for_review. Dormant.';