CREATE OR REPLACE FUNCTION public.lifecycle_onboarding_gates(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a              public.onboarding_applications%ROWTYPE;
  v_el_signed    boolean := false;
  v_aml          boolean := false;
  v_billing      boolean := false;
  v_submitted    boolean := false;
  v_open         boolean := false;
  v_context      boolean := false;
  v_has_lines    boolean := false;
  v_outstanding  text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO a FROM public.onboarding_applications WHERE id = p_application_id;
  IF a.id IS NULL THEN
    RETURN jsonb_build_object('error', 'application_not_found', 'all_pass', false,
                              'outstanding', to_jsonb(ARRAY['application_not_found']));
  END IF;

  v_el_signed := (
    EXISTS (
      SELECT 1 FROM public.engagement_letters el
      WHERE el.onboarding_application_id = p_application_id AND el.signed_at IS NOT NULL
    )
    AND a.contracts_signed_at IS NOT NULL
  );

  v_aml       := (a.aml_status = 'verified');
  v_billing   := (a.billing_status IN ('completed','skipped','not_required'));
  v_submitted := (a.submitted_for_review_at IS NOT NULL OR a.status IN ('portal_pending','for_review'));
  v_open      := (a.status NOT IN ('approved','rejected','cancelled'));

  SELECT EXISTS (SELECT 1 FROM public.quote_lines ql WHERE ql.quote_id = a.quote_id) INTO v_has_lines;
  v_context := (
    a.organization_id IS NOT NULL
    AND a.quote_id IS NOT NULL
    AND v_has_lines
    AND (a.client_id IS NOT NULL OR a.company_id IS NOT NULL
         OR a.application_type IN ('individual','company'))
  );

  IF NOT v_el_signed THEN v_outstanding := v_outstanding || 'engagement_letter_signed'; END IF;
  IF NOT v_aml       THEN v_outstanding := v_outstanding || 'aml_passed'; END IF;
  IF NOT v_billing   THEN v_outstanding := v_outstanding || 'billing_settled'; END IF;
  IF NOT v_submitted THEN v_outstanding := v_outstanding || 'onboarding_submitted'; END IF;
  IF NOT v_open      THEN v_outstanding := v_outstanding || 'not_already_closed'; END IF;
  IF NOT v_context   THEN v_outstanding := v_outstanding || 'missing_activation_context'; END IF;

  RETURN jsonb_build_object(
    'gates', jsonb_build_object(
      'engagement_letter_signed', v_el_signed,
      'aml_passed', v_aml,
      'billing_settled', v_billing,
      'onboarding_submitted', v_submitted,
      'not_already_closed', v_open,
      'activation_context_present', v_context
    ),
    'all_pass', (array_length(v_outstanding, 1) IS NULL),
    'outstanding', to_jsonb(v_outstanding)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_onboarding_gates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_onboarding_gates(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.lifecycle_onboarding_gates(uuid) IS
  'Sprint 1: read-only canonical activation gates for an onboarding application. Returns {gates, all_pass, outstanding}. Shared by lifecycle_evaluate_onboarding_activation and the lifecycle_approve_onboarding guard. Writes nothing.';