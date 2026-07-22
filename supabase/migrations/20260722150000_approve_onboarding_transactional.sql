-- =====================================================================================
-- Client Data Governance Architecture — G2: transactional onboarding-approval merge
-- =====================================================================================
-- Spec: docs/superpowers/specs/2026-07-22-data-governance-architecture-design.md
-- Brief: .superpowers/sdd/g2-brief.md
--
-- Adds ONE additive, idempotent migration that:
--   1. Adds the staff-visible approval-failure state columns to onboarding_applications.
--   2. Creates governance_mask_value() — the single SQL source of truth for value masking
--      (mirrored EXACTLY by src/lib/onboarding-approval-merge-model.ts::maskSensitiveValue).
--   3. Creates governance_record_merge_field() — records data_point_state + an append-only
--      data_audit_log row (masked) for one merged field.
--   4. Creates approve_onboarding_transactional() — the transactional, idempotent merge that
--      CALLS the single effective lifecycle_approve_onboarding (it never re-implements it),
--      then writes onboarding-captured values into the authoritative typed columns (gap-fill
--      only), records governance state/audit, and writes an immutable approval snapshot. Any
--      failure inside the merge rolls back and sets a specific blocked state (never a partial).
--   5. Re-points verify_aml_and_approve at the new RPC (only that one call changes).
--
-- Additive/idempotent: CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS — safe to re-run.
-- SECURITY: the merge RPC is SECURITY DEFINER and self-guards with
-- user_has_organization_access(). Sensitive values (NINO/UTR/DOB/home-address) are NEVER
-- stored or returned raw: audit rows store masked values, and the snapshot's person block is
-- masked too.
-- =====================================================================================

-- ---------------------------------------------------------------------------
-- 1. Additive failure-state columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.onboarding_applications
  ADD COLUMN IF NOT EXISTS approval_blocked_at timestamptz;
ALTER TABLE public.onboarding_applications
  ADD COLUMN IF NOT EXISTS approval_blocked_reason text;

COMMENT ON COLUMN public.onboarding_applications.approval_blocked_reason IS
  'Set by approve_onboarding_transactional when the governance merge fails: the merge rolls back but this reason persists in the outer txn so staff see why approval was blocked (never a silent partial approve).';

-- ---------------------------------------------------------------------------
-- 2. Masking helper — one source of truth with the model
-- ---------------------------------------------------------------------------
-- Mirrors src/lib/onboarding-approval-merge-model.ts::maskSensitiveValue EXACTLY.
-- NULL in -> NULL out; sensitive identifiers reveal the right-2; dob/home-address fully
-- masked; anything else returned unchanged.
CREATE OR REPLACE FUNCTION public.governance_mask_value(p_field_key text, p_val text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_val IS NULL THEN NULL
    WHEN p_field_key IN ('person.nino', 'person.utr') THEN '••••' || right(p_val, 2)
    WHEN p_field_key IN ('person.date_of_birth', 'person.home_address') THEN '••••'
    ELSE p_val
  END;
$function$;

COMMENT ON FUNCTION public.governance_mask_value(text, text) IS
  'Masked form of a governed field value for audit storage. Mirrors src/lib/onboarding-approval-merge-model.ts::maskSensitiveValue — keep both in lockstep.';

-- ---------------------------------------------------------------------------
-- 3. Per-field governance recorder (state upsert + append-only audit row)
-- ---------------------------------------------------------------------------
-- Records that a governed field was provided during onboarding approval. UPSERTs the
-- per-subject governance state (idempotent via the unique subject/field key) and appends a
-- masked audit row. Called only from approve_onboarding_transactional (both SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.governance_record_merge_field(
  p_organization_id uuid,
  p_subject_kind text,
  p_subject_id uuid,
  p_field_key text,
  p_old_value text,
  p_new_value text,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  INSERT INTO public.data_point_state (
    organization_id, subject_kind, subject_id, field_key, status, source, updated_at
  )
  VALUES (
    p_organization_id, p_subject_kind, p_subject_id, p_field_key, 'provided', 'client', now()
  )
  ON CONFLICT (organization_id, subject_kind, subject_id, field_key)
  DO UPDATE SET status = 'provided', source = 'client', updated_at = now();

  INSERT INTO public.data_audit_log (
    organization_id, subject_kind, subject_id, field_key,
    old_value_masked, new_value_masked, actor, origin, event_type
  )
  VALUES (
    p_organization_id, p_subject_kind, p_subject_id, p_field_key,
    public.governance_mask_value(p_field_key, p_old_value),
    public.governance_mask_value(p_field_key, p_new_value),
    p_actor, 'onboarding', 'onboarding_merge'
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. approve_onboarding_transactional — the transactional, idempotent merge
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_onboarding_transactional(
  p_application_id uuid,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_app record;
  v_core jsonb;
  v_snapshot_exists boolean;
  v_company_name text;
  v_existing_utr text;
  v_existing_vat text;
  v_paye text;
  v_person jsonb;
  v_target_id uuid;
  v_action text;
  v_name text;
  v_first text;
  v_last text;
  v_existing_dob date;
  v_existing_nino text;
  v_existing_person_utr text;
  v_existing_home text;
  v_idx int := 0;
  v_persons_merged int := 0;
  v_persons_created int := 0;
  v_fields_recorded int := 0;
  v_resolved jsonb := '[]'::jsonb;
  v_masked_persons jsonb := '[]'::jsonb;
BEGIN
  -- 1. Load provisional onboarding data.
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'onboarding application not found';
  END IF;

  -- 2. Org-access guard.
  IF NOT user_has_organization_access(v_app.organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  -- 3. Idempotency: already approved AND a snapshot exists -> no-op success.
  SELECT EXISTS (
    SELECT 1 FROM public.onboarding_approval_snapshots WHERE application_id = p_application_id
  ) INTO v_snapshot_exists;

  IF v_app.status = 'approved' AND v_snapshot_exists THEN
    RETURN jsonb_build_object(
      'idempotent', true,
      'application_id', p_application_id,
      'status', 'approved'
    );
  END IF;

  -- 4. Atomic merge in an inner subtransaction. On failure its writes roll back and the
  --    EXCEPTION handler records the blocked state in the OUTER txn (so it persists).
  BEGIN
    -- (a) Core activation/jobs/portal/status via the single canonical function.
    SELECT public.lifecycle_approve_onboarding(p_application_id) INTO v_core;

    -- (b) Business governance fields -> typed columns (gap-fill only; never clobber).
    IF v_app.company_id IS NOT NULL THEN
      SELECT company_name, utr, vat_number
        INTO v_company_name, v_existing_utr, v_existing_vat
        FROM public.companies WHERE id = v_app.company_id;

      IF nullif(v_app.utr, '') IS NOT NULL AND (v_existing_utr IS NULL OR v_existing_utr = '') THEN
        UPDATE public.companies SET utr = v_app.utr WHERE id = v_app.company_id;
        PERFORM public.governance_record_merge_field(
          v_app.organization_id, 'company', v_app.company_id, 'company.utr',
          v_existing_utr, v_app.utr, p_actor);
        v_fields_recorded := v_fields_recorded + 1;
      END IF;

      IF nullif(v_app.vat_number, '') IS NOT NULL AND (v_existing_vat IS NULL OR v_existing_vat = '') THEN
        UPDATE public.companies SET vat_number = v_app.vat_number WHERE id = v_app.company_id;
        PERFORM public.governance_record_merge_field(
          v_app.organization_id, 'company', v_app.company_id, 'company.vat_number',
          v_existing_vat, v_app.vat_number, p_actor);
        v_fields_recorded := v_fields_recorded + 1;
      END IF;

      -- PAYE reference materialises a child scheme row (never a scalar on the company).
      v_paye := nullif(v_app.paye_reference, '');
      IF v_paye IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.paye_schemes
          WHERE company_id = v_app.company_id AND employer_paye_reference = v_paye
        ) THEN
          INSERT INTO public.paye_schemes (
            organization_id, company_id, employer_paye_reference, name
          )
          VALUES (
            v_app.organization_id, v_app.company_id, v_paye,
            coalesce(v_company_name, 'PAYE Scheme')
          );
          PERFORM public.governance_record_merge_field(
            v_app.organization_id, 'company', v_app.company_id, 'company.paye_reference',
            NULL, v_paye, p_actor);
          v_fields_recorded := v_fields_recorded + 1;
        END IF;
      END IF;
    END IF;

    -- (c) Person merge — resolve identity NEVER by name; gap-fill personal fields.
    FOR v_person IN
      SELECT value FROM jsonb_array_elements(coalesce(v_app.personal_details, '[]'::jsonb))
    LOOP
      v_target_id := NULL;
      v_action := NULL;

      IF nullif(v_person->>'person_id', '') IS NOT NULL THEN
        SELECT id INTO v_target_id FROM public.company_persons
          WHERE id = (v_person->>'person_id')::uuid
            AND organization_id = v_app.organization_id;
        IF v_target_id IS NOT NULL THEN v_action := 'merged'; END IF;
      ELSIF nullif(v_person->>'ch_officer_id', '') IS NOT NULL THEN
        SELECT id INTO v_target_id FROM public.company_persons
          WHERE organization_id = v_app.organization_id
            AND ch_officer_id = v_person->>'ch_officer_id'
          LIMIT 1;
        IF v_target_id IS NOT NULL THEN v_action := 'merged'; END IF;
      END IF;

      IF v_target_id IS NULL THEN
        -- create-new branch (the interim default until G3 pre-links CH officers).
        v_name := trim(coalesce(v_person->>'name', ''));
        v_first := split_part(v_name, ' ', 1);
        IF position(' ' in v_name) = 0 THEN
          v_last := v_first;
        ELSE
          v_last := trim(substr(v_name, position(' ' in v_name) + 1));
        END IF;
        IF v_last IS NULL OR v_last = '' THEN v_last := v_first; END IF;

        INSERT INTO public.company_persons (organization_id, first_name, last_name)
        VALUES (v_app.organization_id, v_first, v_last)
        RETURNING id INTO v_target_id;
        v_action := 'created';
        v_persons_created := v_persons_created + 1;
      ELSE
        v_persons_merged := v_persons_merged + 1;
      END IF;

      -- Snapshot existing personal columns for gap-fill decisions + audit old values.
      SELECT date_of_birth, nino, utr, residential_address_line_1
        INTO v_existing_dob, v_existing_nino, v_existing_person_utr, v_existing_home
        FROM public.company_persons WHERE id = v_target_id;

      IF nullif(v_person->>'date_of_birth', '') IS NOT NULL AND v_existing_dob IS NULL THEN
        UPDATE public.company_persons
          SET date_of_birth = (v_person->>'date_of_birth')::date
          WHERE id = v_target_id;
        PERFORM public.governance_record_merge_field(
          v_app.organization_id, 'person', v_target_id, 'person.date_of_birth',
          NULL, v_person->>'date_of_birth', p_actor);
        v_fields_recorded := v_fields_recorded + 1;
      END IF;

      IF nullif(v_person->>'nino', '') IS NOT NULL AND (v_existing_nino IS NULL OR v_existing_nino = '') THEN
        UPDATE public.company_persons SET nino = v_person->>'nino' WHERE id = v_target_id;
        PERFORM public.governance_record_merge_field(
          v_app.organization_id, 'person', v_target_id, 'person.nino',
          v_existing_nino, v_person->>'nino', p_actor);
        v_fields_recorded := v_fields_recorded + 1;
      END IF;

      IF nullif(v_person->>'utr', '') IS NOT NULL AND (v_existing_person_utr IS NULL OR v_existing_person_utr = '') THEN
        UPDATE public.company_persons SET utr = v_person->>'utr' WHERE id = v_target_id;
        PERFORM public.governance_record_merge_field(
          v_app.organization_id, 'person', v_target_id, 'person.utr',
          v_existing_person_utr, v_person->>'utr', p_actor);
        v_fields_recorded := v_fields_recorded + 1;
      END IF;

      IF nullif(v_person->>'home_address', '') IS NOT NULL AND (v_existing_home IS NULL OR v_existing_home = '') THEN
        UPDATE public.company_persons
          SET residential_address_line_1 = v_person->>'home_address'
          WHERE id = v_target_id;
        PERFORM public.governance_record_merge_field(
          v_app.organization_id, 'person', v_target_id, 'person.home_address',
          v_existing_home, v_person->>'home_address', p_actor);
        v_fields_recorded := v_fields_recorded + 1;
      END IF;

      -- resolved_persons: identity + action ONLY (no raw sensitive values).
      v_resolved := v_resolved || jsonb_build_object(
        'index', v_idx, 'person_id', v_target_id, 'action', v_action);

      -- masked provisional person block for the snapshot (sensitive fields masked).
      v_masked_persons := v_masked_persons || jsonb_build_object(
        'name', v_person->>'name',
        'role', v_person->>'role',
        'date_of_birth', public.governance_mask_value('person.date_of_birth', v_person->>'date_of_birth'),
        'nino', public.governance_mask_value('person.nino', v_person->>'nino'),
        'utr', public.governance_mask_value('person.utr', v_person->>'utr'),
        'home_address', public.governance_mask_value('person.home_address', v_person->>'home_address'),
        'person_id', v_person->>'person_id',
        'ch_officer_id', v_person->>'ch_officer_id'
      );

      v_idx := v_idx + 1;
    END LOOP;

    -- (e) Immutable approval snapshot (no raw sensitive values anywhere in it).
    INSERT INTO public.onboarding_approval_snapshots (
      organization_id, application_id, created_by, snapshot
    )
    VALUES (
      v_app.organization_id, p_application_id, p_actor,
      jsonb_build_object(
        'provisional', jsonb_build_object(
          'application_id', p_application_id,
          'organization_id', v_app.organization_id,
          'client_id', v_app.client_id,
          'company_id', v_app.company_id,
          'lead_id', v_app.lead_id,
          'paye_reference', v_app.paye_reference,
          'vat_number', v_app.vat_number,
          'utr', v_app.utr,
          'ch_correction_note', v_app.ch_correction_note,
          'personal_details', v_masked_persons
        ),
        'resolved_persons', v_resolved,
        'approved_at', now(),
        'actor', p_actor
      )
    );

    -- (f) Clear any prior failure state.
    UPDATE public.onboarding_applications
      SET approval_blocked_at = NULL, approval_blocked_reason = NULL
      WHERE id = p_application_id;

    -- (g) Success.
    RETURN v_core || jsonb_build_object(
      'governance', jsonb_build_object(
        'persons_merged', v_persons_merged,
        'persons_created', v_persons_created,
        'fields_recorded', v_fields_recorded
      ),
      'snapshot_written', true
    );

  EXCEPTION WHEN OTHERS THEN
    -- Inner writes are rolled back; record the blocked state in the outer txn (persists).
    UPDATE public.onboarding_applications
      SET approval_blocked_at = now(),
          approval_blocked_reason = left(SQLERRM, 500)
      WHERE id = p_application_id;
    RETURN jsonb_build_object(
      'approved', false,
      'blocked', true,
      'reason', left(SQLERRM, 500),
      'application_id', p_application_id
    );
  END;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.approve_onboarding_transactional(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Wire onboarding approval to the new RPC
-- ---------------------------------------------------------------------------
-- Re-created verbatim from 20260625110924 EXCEPT the one approval call now routes through
-- the transactional merge (AML verification + surrounding structure + return shape preserved).
CREATE OR REPLACE FUNCTION public.verify_aml_and_approve(p_onboarding_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_onboarding record;
  v_approval jsonb;
  v_approval_error text;
BEGIN
  SELECT * INTO v_onboarding FROM onboarding_applications WHERE id = p_onboarding_id;
  IF v_onboarding.id IS NULL THEN
    RAISE EXCEPTION 'Onboarding application not found';
  END IF;

  IF NOT user_has_organization_access(v_onboarding.organization_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Mark AML verified (idempotent)
  IF v_onboarding.aml_status IS DISTINCT FROM 'verified' THEN
    UPDATE onboarding_applications
    SET aml_status = 'verified',
        aml_verified_at = now(),
        aml_expiry_date = CURRENT_DATE + INTERVAL '5 years'
    WHERE id = p_onboarding_id;

    INSERT INTO audit_log (organization_id, entity_type, entity_id, action, old_value, new_value, user_id)
    VALUES (v_onboarding.organization_id, 'onboarding', p_onboarding_id, 'aml_verified',
      v_onboarding.aml_status, 'verified', auth.uid());
  END IF;

  -- If already approved/rejected, return AML-only result
  IF v_onboarding.status IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object(
      'aml_status', 'verified',
      'aml_verified_at', now(),
      'aml_expiry_date', CURRENT_DATE + INTERVAL '5 years',
      'already_finalized', true,
      'status', v_onboarding.status
    );
  END IF;

  -- Try approval; surface failures without rolling back the AML decision.
  -- Routes through the transactional governance merge (G2) instead of calling the core
  -- lifecycle function directly — the merge itself wraps the core and records governance.
  BEGIN
    v_approval := public.approve_onboarding_transactional(p_onboarding_id, auth.uid());
  EXCEPTION WHEN OTHERS THEN
    v_approval_error := SQLERRM;
    RETURN jsonb_build_object(
      'aml_status', 'verified',
      'aml_verified_at', now(),
      'aml_expiry_date', CURRENT_DATE + INTERVAL '5 years',
      'approval_error', v_approval_error
    );
  END;

  RETURN v_approval
    || jsonb_build_object(
      'aml_status', 'verified',
      'aml_verified_at', now(),
      'aml_expiry_date', CURRENT_DATE + INTERVAL '5 years'
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.verify_aml_and_approve(uuid) TO authenticated;
