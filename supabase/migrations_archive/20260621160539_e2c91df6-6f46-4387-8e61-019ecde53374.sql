-- ============================================================
-- Sprint 1 — Increment 1 / Task 4
-- Flag-aware activation evaluator (DORMANT — nothing calls it yet)
-- ============================================================
-- lifecycle_evaluate_onboarding_activation(application_id):
--   * Flag OFF (default for every org): returns a dry-run gate JSON and CREATES
--     NOTHING. This is the guarantee that applying this migration changes no
--     live behaviour.
--   * Already closed (approved/rejected/cancelled): no-op.
--   * Flag ON + gates fail: route the application to 'for_review', create no
--     active rows.
--   * Flag ON + all gates pass: ensure the active accountant_client_link (the
--     one output the proven approve body does NOT create), then delegate
--     entity/engagement/job/client_task/info-request/portal creation to the
--     existing, idempotent lifecycle_approve_onboarding. NO deadlines are
--     created (those remain owned by the deadline engine).
--
-- Nothing invokes this function in Increment 1; Increment 2 wires it into the
-- onboarding flow for flagged orgs. Link inserts are lookup-guarded and also
-- protected by the Task 2 partial unique indexes.
-- ============================================================

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

  v_flag     := public.is_canonical_lifecycle_enabled(a.organization_id);
  v_gates    := public.lifecycle_onboarding_gates(p_application_id);
  v_all_pass := COALESCE((v_gates->>'all_pass')::boolean, false);

  -- Flag OFF: dry-run only. CREATE NOTHING.
  IF NOT v_flag THEN
    RETURN jsonb_build_object('mode', 'dry_run', 'flag', false,
                              'would_activate', v_all_pass, 'gates', v_gates);
  END IF;

  -- Already closed: no-op.
  IF a.status IN ('approved','rejected','cancelled') THEN
    RETURN jsonb_build_object('mode', 'noop_closed', 'status', a.status, 'gates', v_gates);
  END IF;

  -- Flag ON but gates fail: route to review, create nothing.
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

  -- Flag ON and all gates pass: ensure active link, then delegate activation.
  -- (1) accountant_client_link — the ONE output approve does not create.
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
  -- NOTE: when client_id/company_id are NULL here, the entity is created by the
  -- delegated approve call below; Increment 2 moves link creation to run AFTER
  -- entity resolution. In Increment 1 this function is dormant and the
  -- missing_activation_context gate already requires a resolvable target.

  -- (2) entity + engagements + jobs + client_tasks + info-requests + portal —
  -- proven, idempotent. (Sets the application to 'approved'.) No deadlines.
  v_approve := public.lifecycle_approve_onboarding(p_application_id);

  RETURN jsonb_build_object('mode', 'activated', 'gates', v_gates, 'approve', v_approve);
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_evaluate_onboarding_activation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_evaluate_onboarding_activation(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.lifecycle_evaluate_onboarding_activation(uuid) IS
  'Sprint 1: flag-aware onboarding activation evaluator. Flag OFF => dry-run, no writes. Flag ON => activate (link + delegate to approve) when gates pass, else route to for_review. Dormant in Increment 1.';
