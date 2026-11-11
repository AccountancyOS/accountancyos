-- Phase 4: person/profile model management RPCs.
-- Four SECURITY DEFINER RPCs for the company_persons model introduced in
-- 20251204014132 and extended in 20260720190000 (primary_contact_person_id,
-- is_signatory, contacts.person_id). All idempotent (CREATE OR REPLACE);
-- all derive their org from the entity server-side (never trust a
-- caller-supplied org) and guard with the existing
-- public.user_has_organization_access(org_id) helper.

-- =====================================================
-- 1. set_primary_contact(p_company_id, p_person_id)
--    Sets companies.primary_contact_person_id. The person must be
--    associated with the company: either an officer of it
--    (company_officers.person_id/company_id) or linked via a contacts row
--    (contacts.person_id for that company_id) — otherwise RAISE.
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_primary_contact(p_company_id uuid, p_person_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_associated boolean;
BEGIN
  SELECT organization_id INTO v_organization_id
  FROM public.companies WHERE id = p_company_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Company not found: %', p_company_id;
  END IF;

  IF NOT public.user_has_organization_access(v_organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.company_officers
    WHERE company_id = p_company_id AND person_id = p_person_id
  ) OR EXISTS (
    SELECT 1 FROM public.contacts
    WHERE company_id = p_company_id AND person_id = p_person_id
  ) INTO v_associated;

  IF NOT v_associated THEN
    RAISE EXCEPTION 'Person % is not associated with company % (no officer or contacts row)', p_person_id, p_company_id;
  END IF;

  UPDATE public.companies
  SET primary_contact_person_id = p_person_id
  WHERE id = p_company_id;

  RETURN jsonb_build_object(
    'ok', true,
    'company_id', p_company_id,
    'primary_contact_person_id', p_person_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_primary_contact(uuid, uuid) TO authenticated;

-- =====================================================
-- 2. set_signatory(p_officer_id, p_on)
--    Toggles company_officers.is_signatory. This is a plain UPDATE — the
--    trg_enforce_signatory_rules trigger (20260720190000) enforces that a
--    resigned officer can never become a signatory (auto-demotes) and caps
--    active signatories at 10 per company.
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_signatory(p_officer_id uuid, p_on boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_is_signatory boolean;
BEGIN
  SELECT co.organization_id INTO v_organization_id
  FROM public.company_officers o
  JOIN public.companies co ON co.id = o.company_id
  WHERE o.id = p_officer_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Officer not found: %', p_officer_id;
  END IF;

  IF NOT public.user_has_organization_access(v_organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  UPDATE public.company_officers
  SET is_signatory = p_on
  WHERE id = p_officer_id
  RETURNING is_signatory INTO v_is_signatory;

  RETURN jsonb_build_object(
    'ok', true,
    'officer_id', p_officer_id,
    'is_signatory', v_is_signatory
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_signatory(uuid, boolean) TO authenticated;

-- =====================================================
-- 3. link_person_to_sa_client(p_person_id, p_client_id)
--    Sets company_persons.linked_client_id. The target client must belong
--    to the same organization as the person — otherwise RAISE (prevents
--    cross-tenant linking).
-- =====================================================
CREATE OR REPLACE FUNCTION public.link_person_to_sa_client(p_person_id uuid, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_client_org_id uuid;
BEGIN
  SELECT organization_id INTO v_organization_id
  FROM public.company_persons WHERE id = p_person_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Person not found: %', p_person_id;
  END IF;

  IF NOT public.user_has_organization_access(v_organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  SELECT organization_id INTO v_client_org_id
  FROM public.clients WHERE id = p_client_id;

  IF v_client_org_id IS NULL THEN
    RAISE EXCEPTION 'Client not found: %', p_client_id;
  END IF;

  IF v_client_org_id <> v_organization_id THEN
    RAISE EXCEPTION 'Client % belongs to a different organization than person %', p_client_id, p_person_id;
  END IF;

  UPDATE public.company_persons
  SET linked_client_id = p_client_id
  WHERE id = p_person_id;

  RETURN jsonb_build_object(
    'ok', true,
    'person_id', p_person_id,
    'linked_client_id', p_client_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_person_to_sa_client(uuid, uuid) TO authenticated;

-- =====================================================
-- 4. grant_person_portal_access(p_person_id, p_user_email)
--    Grants portal access across every entity the person is linked to:
--    their linked_client_id (as 'client'), and every company where they
--    are an ACTIVE officer (company_officers.resigned_at IS NULL, as
--    'company'). Reuses the existing lifecycle_grant_portal_access RPC
--    (20251201223119, updated 20260625110924) for the actual invite-row +
--    token + email-queue + audit_log work, per entity — no hand-rolled
--    second portal_access insert/token/email path here.
--
--    Dedup: resolves p_user_email -> auth.users.id once. For each target
--    entity, if that user already holds an active, non-revoked
--    portal_access row for it, the grant is skipped. Brand-new invitees
--    (no auth.users row yet for that email) cannot be deduped this way —
--    lifecycle_grant_portal_access is called for them every time, which is
--    safe (it inserts a fresh invite row per call; there is no unique
--    index on (entity, email) to violate) but means repeated calls with a
--    not-yet-registered email will queue repeated invite rows/emails.
-- =====================================================
CREATE OR REPLACE FUNCTION public.grant_person_portal_access(p_person_id uuid, p_user_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_linked_client_id uuid;
  v_target_user_id uuid;
  v_company record;
  v_granted int := 0;
  v_skipped int := 0;
  v_already_active boolean;
BEGIN
  SELECT organization_id, linked_client_id
  INTO v_organization_id, v_linked_client_id
  FROM public.company_persons WHERE id = p_person_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Person not found: %', p_person_id;
  END IF;

  IF NOT public.user_has_organization_access(v_organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  SELECT id INTO v_target_user_id FROM auth.users WHERE email = p_user_email LIMIT 1;

  -- Linked SA client entity.
  IF v_linked_client_id IS NOT NULL THEN
    v_already_active := false;
    IF v_target_user_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.portal_access
        WHERE client_id = v_linked_client_id
          AND user_id = v_target_user_id
          AND is_active
          AND status <> 'revoked'
      ) INTO v_already_active;
    END IF;

    IF v_already_active THEN
      v_skipped := v_skipped + 1;
    ELSE
      PERFORM public.lifecycle_grant_portal_access('client', v_linked_client_id, p_user_email);
      v_granted := v_granted + 1;
    END IF;
  END IF;

  -- Every company where the person is a currently-active (non-resigned) officer.
  FOR v_company IN
    SELECT DISTINCT company_id
    FROM public.company_officers
    WHERE person_id = p_person_id AND resigned_at IS NULL
  LOOP
    v_already_active := false;
    IF v_target_user_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.portal_access
        WHERE company_id = v_company.company_id
          AND user_id = v_target_user_id
          AND is_active
          AND status <> 'revoked'
      ) INTO v_already_active;
    END IF;

    IF v_already_active THEN
      v_skipped := v_skipped + 1;
    ELSE
      PERFORM public.lifecycle_grant_portal_access('company', v_company.company_id, p_user_email);
      v_granted := v_granted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'person_id', p_person_id,
    'granted', v_granted,
    'skipped', v_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_person_portal_access(uuid, text) TO authenticated;
