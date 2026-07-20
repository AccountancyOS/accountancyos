CREATE OR REPLACE FUNCTION public.set_primary_contact(p_company_id uuid, p_person_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_associated boolean;
BEGIN
  SELECT organization_id INTO v_org FROM public.companies WHERE id = p_company_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Company not found'; END IF;
  IF NOT public.user_has_organization_access(v_org) THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.company_officers WHERE company_id = p_company_id AND person_id = p_person_id
    UNION ALL
    SELECT 1 FROM public.contacts WHERE company_id = p_company_id AND person_id = p_person_id
  ) INTO v_associated;
  IF NOT v_associated THEN RAISE EXCEPTION 'Person is not associated with this company'; END IF;
  UPDATE public.companies SET primary_contact_person_id = p_person_id, updated_at = now() WHERE id = p_company_id;
END;$$;

CREATE OR REPLACE FUNCTION public.set_signatory(p_officer_id uuid, p_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  SELECT c.organization_id INTO v_org FROM public.company_officers o
    JOIN public.companies c ON c.id = o.company_id WHERE o.id = p_officer_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Officer not found'; END IF;
  IF NOT public.user_has_organization_access(v_org) THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.company_officers SET is_signatory = p_on, updated_at = now() WHERE id = p_officer_id;
END;$$;

CREATE OR REPLACE FUNCTION public.link_person_to_sa_client(p_person_id uuid, p_client_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_person_org uuid; v_client_org uuid;
BEGIN
  SELECT organization_id INTO v_person_org FROM public.company_persons WHERE id = p_person_id;
  SELECT organization_id INTO v_client_org FROM public.clients          WHERE id = p_client_id;
  IF v_person_org IS NULL OR v_client_org IS NULL THEN RAISE EXCEPTION 'Person or client not found'; END IF;
  IF v_person_org <> v_client_org THEN RAISE EXCEPTION 'Person and client belong to different organizations'; END IF;
  IF NOT public.user_has_organization_access(v_person_org) THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.company_persons SET linked_client_id = p_client_id, updated_at = now() WHERE id = p_person_id;
END;$$;

CREATE OR REPLACE FUNCTION public.grant_person_portal_access(p_person_id uuid, p_user_email text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid; v_client_id uuid; v_user_id uuid;
  v_created integer := 0; v_rows integer := 0;
  r_company record;
BEGIN
  SELECT organization_id, linked_client_id INTO v_org, v_client_id
    FROM public.company_persons WHERE id = p_person_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Person not found'; END IF;
  IF NOT public.user_has_organization_access(v_org) THEN RAISE EXCEPTION 'Access denied'; END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_user_email) LIMIT 1;

  IF v_client_id IS NOT NULL THEN
    INSERT INTO public.portal_access (organization_id, client_id, user_id, role, status, invited_at)
    VALUES (v_org, v_client_id, v_user_id, 'primary_contact', 'invited', now())
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_created := v_created + v_rows;
  END IF;

  FOR r_company IN
    SELECT DISTINCT o.company_id FROM public.company_officers o
     WHERE o.person_id = p_person_id AND o.resigned_at IS NULL
  LOOP
    INSERT INTO public.portal_access (organization_id, company_id, user_id, role, status, invited_at)
    VALUES (v_org, r_company.company_id, v_user_id, 'primary_contact', 'invited', now())
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_created := v_created + v_rows;
  END LOOP;

  RETURN v_created;
END;$$;

REVOKE ALL ON FUNCTION public.set_primary_contact(uuid, uuid)         FROM public;
REVOKE ALL ON FUNCTION public.set_signatory(uuid, boolean)            FROM public;
REVOKE ALL ON FUNCTION public.link_person_to_sa_client(uuid, uuid)    FROM public;
REVOKE ALL ON FUNCTION public.grant_person_portal_access(uuid, text)  FROM public;
GRANT EXECUTE ON FUNCTION public.set_primary_contact(uuid, uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_signatory(uuid, boolean)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_person_to_sa_client(uuid, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_person_portal_access(uuid, text) TO authenticated;