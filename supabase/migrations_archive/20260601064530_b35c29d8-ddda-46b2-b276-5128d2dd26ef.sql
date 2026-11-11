
-- 1. Engagement letter template variants
CREATE TABLE IF NOT EXISTS public.engagement_letter_template_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid,
  variant_group_key text,
  client_type text,
  service_code text,
  legal_entity text,
  engagement_kind text NOT NULL DEFAULT 'recurring' CHECK (engagement_kind IN ('one_off','recurring','annual_renewal')),
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  subject text NOT NULL,
  body text NOT NULL,
  merge_fields text[] DEFAULT ARRAY[]::text[],
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_variant_specificity
  ON public.engagement_letter_template_variants (
    organization_id, coalesce(client_type,''), coalesce(service_code,''),
    coalesce(legal_entity,''), engagement_kind
  ) WHERE is_active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_letter_template_variants TO authenticated;
GRANT ALL ON public.engagement_letter_template_variants TO service_role;
ALTER TABLE public.engagement_letter_template_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "elv_select" ON public.engagement_letter_template_variants FOR SELECT TO authenticated USING (user_has_organization_access(organization_id));
CREATE POLICY "elv_insert" ON public.engagement_letter_template_variants FOR INSERT TO authenticated WITH CHECK (user_has_organization_access(organization_id));
CREATE POLICY "elv_update" ON public.engagement_letter_template_variants FOR UPDATE TO authenticated USING (user_has_organization_access(organization_id)) WITH CHECK (user_has_organization_access(organization_id));
CREATE POLICY "elv_delete" ON public.engagement_letter_template_variants FOR DELETE TO authenticated USING (user_has_organization_access(organization_id));

-- 2. KYC packs
CREATE TABLE IF NOT EXISTS public.kyc_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','submitted','approved','rejected','expired')),
  due_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  expires_at timestamptz,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyc_packs_client ON public.kyc_packs (organization_id, client_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kyc_packs TO authenticated;
GRANT ALL ON public.kyc_packs TO service_role;
ALTER TABLE public.kyc_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kyc_packs_select" ON public.kyc_packs FOR SELECT TO authenticated USING (user_has_organization_access(organization_id));
CREATE POLICY "kyc_packs_insert" ON public.kyc_packs FOR INSERT TO authenticated WITH CHECK (user_has_organization_access(organization_id));
CREATE POLICY "kyc_packs_update" ON public.kyc_packs FOR UPDATE TO authenticated USING (user_has_organization_access(organization_id)) WITH CHECK (user_has_organization_access(organization_id));
CREATE POLICY "kyc_packs_delete" ON public.kyc_packs FOR DELETE TO authenticated USING (user_has_organization_access(organization_id));

-- 3. KYC subjects
CREATE TABLE IF NOT EXISTS public.kyc_pack_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kyc_pack_id uuid NOT NULL REFERENCES public.kyc_packs(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('individual_client','director','partner','llp_member','trustee','psc','authorised_contact')),
  subject_ref_type text CHECK (subject_ref_type IN ('contact','director','free_text')),
  subject_ref_id uuid,
  subject_name text NOT NULL,
  subject_status text NOT NULL DEFAULT 'pending' CHECK (subject_status IN ('pending','documents_requested','partial','complete','waived','failed')),
  due_at timestamptz,
  last_chased_at timestamptz,
  chaser_count integer NOT NULL DEFAULT 0,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  waiver_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyc_subjects_pack ON public.kyc_pack_subjects (kyc_pack_id, subject_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kyc_pack_subjects TO authenticated;
GRANT ALL ON public.kyc_pack_subjects TO service_role;
ALTER TABLE public.kyc_pack_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kyc_subj_select" ON public.kyc_pack_subjects FOR SELECT TO authenticated USING (user_has_organization_access(organization_id));
CREATE POLICY "kyc_subj_insert" ON public.kyc_pack_subjects FOR INSERT TO authenticated WITH CHECK (user_has_organization_access(organization_id));
CREATE POLICY "kyc_subj_update" ON public.kyc_pack_subjects FOR UPDATE TO authenticated USING (user_has_organization_access(organization_id)) WITH CHECK (user_has_organization_access(organization_id));
CREATE POLICY "kyc_subj_delete" ON public.kyc_pack_subjects FOR DELETE TO authenticated USING (user_has_organization_access(organization_id));

-- 4. CH diff staging
CREATE TABLE IF NOT EXISTS public.companies_house_diff_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid,
  company_id uuid,
  company_number text NOT NULL,
  field_path text NOT NULL,
  current_value jsonb,
  incoming_value jsonb,
  source text NOT NULL DEFAULT 'ch_sync',
  detected_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','superseded')),
  decided_by uuid,
  decided_at timestamptz,
  decision_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ch_diff_status ON public.companies_house_diff_staging (organization_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_ch_diff_company ON public.companies_house_diff_staging (organization_id, company_number);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies_house_diff_staging TO authenticated;
GRANT ALL ON public.companies_house_diff_staging TO service_role;
ALTER TABLE public.companies_house_diff_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ch_diff_select" ON public.companies_house_diff_staging FOR SELECT TO authenticated USING (user_has_organization_access(organization_id));
CREATE POLICY "ch_diff_insert" ON public.companies_house_diff_staging FOR INSERT TO authenticated WITH CHECK (user_has_organization_access(organization_id));
CREATE POLICY "ch_diff_update" ON public.companies_house_diff_staging FOR UPDATE TO authenticated USING (user_has_organization_access(organization_id)) WITH CHECK (user_has_organization_access(organization_id));

-- 5. Lead activity summary
CREATE TABLE IF NOT EXISTS public.lead_activity_summary (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_activity_at timestamptz,
  last_stage_change_at timestamptz,
  stage text,
  dormant_threshold_days integer NOT NULL DEFAULT 30,
  is_dormant boolean NOT NULL DEFAULT false,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_activity_dormant ON public.lead_activity_summary (organization_id, is_dormant);
GRANT SELECT ON public.lead_activity_summary TO authenticated;
GRANT ALL ON public.lead_activity_summary TO service_role;
ALTER TABLE public.lead_activity_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_act_select" ON public.lead_activity_summary FOR SELECT TO authenticated USING (user_has_organization_access(organization_id));

-- Extend automation_workflow_templates (uses org_id not organization_id)
ALTER TABLE public.automation_workflow_templates
  ADD COLUMN IF NOT EXISTS definition_kind text DEFAULT 'linear' CHECK (definition_kind IN ('linear','branching'));
-- 'key' column already serves as a stable identifier; reuse it for seed idempotency.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS ported_to_client_id uuid,
  ADD COLUMN IF NOT EXISTS ported_at timestamptz;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS last_kyc_pack_id uuid,
  ADD COLUMN IF NOT EXISTS last_engagement_letter_id uuid;

-- updated_at triggers
CREATE TRIGGER trg_eng_variants_upd BEFORE UPDATE ON public.engagement_letter_template_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_kyc_packs_upd BEFORE UPDATE ON public.kyc_packs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_kyc_subj_upd BEFORE UPDATE ON public.kyc_pack_subjects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ch_diff_upd BEFORE UPDATE ON public.companies_house_diff_staging FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =================== RPCs ===================

CREATE OR REPLACE FUNCTION public.port_quote_to_client(p_quote_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_quote record;
  v_lead record;
  v_client_id uuid;
  v_org_id uuid;
BEGIN
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF v_quote.ported_to_client_id IS NOT NULL THEN RETURN v_quote.ported_to_client_id; END IF;
  v_org_id := v_quote.organization_id;
  IF NOT user_has_organization_access(v_org_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;

  v_client_id := v_quote.client_id;
  IF v_client_id IS NULL THEN
    IF v_quote.lead_id IS NULL THEN RAISE EXCEPTION 'Quote has no client or lead to port from'; END IF;
    SELECT * INTO v_lead FROM public.leads WHERE id = v_quote.lead_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;

    SELECT id INTO v_client_id FROM public.clients
      WHERE organization_id = v_org_id AND lower(email) = lower(v_lead.email)
      LIMIT 1;

    IF v_client_id IS NULL THEN
      INSERT INTO public.clients (organization_id, first_name, last_name, email, phone, client_type, status)
      VALUES (v_org_id, v_lead.first_name, v_lead.last_name, v_lead.email, v_lead.phone,
              coalesce(v_lead.lead_type,'other'), 'pending')
      RETURNING id INTO v_client_id;
    END IF;
  END IF;

  UPDATE public.quotes SET ported_to_client_id = v_client_id, ported_at = now(), client_id = v_client_id WHERE id = p_quote_id;

  INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, new_value, metadata)
  VALUES (v_org_id, 'CLIENT_ONBOARDING_STARTED', 'client', v_client_id,
          jsonb_build_object('quote_id', p_quote_id),
          jsonb_build_object('source','port_quote_to_client'));

  RETURN v_client_id;
END;
$$;
REVOKE ALL ON FUNCTION public.port_quote_to_client(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.port_quote_to_client(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.resolve_engagement_letter_variant(
  p_organization_id uuid, p_client_type text, p_service_code text,
  p_legal_entity text, p_engagement_kind text
) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.engagement_letter_template_variants
  WHERE organization_id = p_organization_id
    AND is_active
    AND engagement_kind = coalesce(p_engagement_kind,'recurring')
    AND (client_type = p_client_type OR client_type IS NULL)
    AND (service_code = p_service_code OR service_code IS NULL)
    AND (legal_entity = p_legal_entity OR legal_entity IS NULL)
  ORDER BY
    (client_type = p_client_type)::int DESC,
    (service_code = p_service_code)::int DESC,
    (legal_entity = p_legal_entity)::int DESC,
    is_default DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_engagement_letter_variant(uuid, text, text, text, text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.start_kyc_pack(p_client_id uuid, p_subjects jsonb DEFAULT '[]'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org_id uuid; v_pack_id uuid; v_subj jsonb;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.clients WHERE id = p_client_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Client not found'; END IF;
  IF NOT user_has_organization_access(v_org_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;

  INSERT INTO public.kyc_packs (organization_id, client_id, status, due_at)
  VALUES (v_org_id, p_client_id, 'in_progress', now() + interval '14 days')
  RETURNING id INTO v_pack_id;

  FOR v_subj IN SELECT * FROM jsonb_array_elements(coalesce(p_subjects, '[]'::jsonb))
  LOOP
    INSERT INTO public.kyc_pack_subjects (
      organization_id, kyc_pack_id, subject_type, subject_ref_type, subject_ref_id, subject_name, due_at
    ) VALUES (
      v_org_id, v_pack_id,
      coalesce(v_subj->>'subject_type','individual_client'),
      v_subj->>'subject_ref_type',
      nullif(v_subj->>'subject_ref_id','')::uuid,
      coalesce(v_subj->>'subject_name','Subject'),
      now() + interval '14 days'
    );
  END LOOP;

  UPDATE public.clients SET last_kyc_pack_id = v_pack_id WHERE id = p_client_id;

  INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, new_value)
  VALUES (v_org_id, 'KYC_STATUS_CHANGED', 'client', p_client_id,
          jsonb_build_object('kyc_pack_id', v_pack_id, 'status', 'in_progress'));

  RETURN v_pack_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.start_kyc_pack(uuid, jsonb) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.record_kyc_subject_progress(p_subject_id uuid, p_new_status text, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pack_id uuid; v_org_id uuid; v_client_id uuid; v_all_done boolean;
BEGIN
  UPDATE public.kyc_pack_subjects
    SET subject_status = p_new_status,
        waiver_reason = CASE WHEN p_new_status = 'waived' THEN p_notes ELSE waiver_reason END
  WHERE id = p_subject_id
  RETURNING kyc_pack_id, organization_id INTO v_pack_id, v_org_id;
  IF v_pack_id IS NULL THEN RAISE EXCEPTION 'Subject not found'; END IF;
  IF NOT user_has_organization_access(v_org_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;

  SELECT bool_and(subject_status IN ('complete','waived')) INTO v_all_done
  FROM public.kyc_pack_subjects WHERE kyc_pack_id = v_pack_id;

  IF v_all_done THEN
    UPDATE public.kyc_packs SET status = 'submitted', submitted_at = now()
    WHERE id = v_pack_id RETURNING client_id INTO v_client_id;
    INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, new_value)
    VALUES (v_org_id, 'KYC_STATUS_CHANGED', 'client', v_client_id,
            jsonb_build_object('kyc_pack_id', v_pack_id, 'status', 'submitted'));
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_kyc_subject_progress(uuid, text, text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.apply_ch_diff(p_diff_id uuid, p_decision text, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_diff record;
BEGIN
  SELECT * INTO v_diff FROM public.companies_house_diff_staging WHERE id = p_diff_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Diff not found'; END IF;
  IF NOT user_has_organization_access(v_diff.organization_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF v_diff.status <> 'pending' THEN RAISE EXCEPTION 'Diff already decided'; END IF;
  IF p_decision NOT IN ('accept','reject') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  UPDATE public.companies_house_diff_staging
    SET status = CASE WHEN p_decision='accept' THEN 'accepted' ELSE 'rejected' END,
        decided_by = auth.uid(), decided_at = now(), decision_notes = p_notes
  WHERE id = p_diff_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.apply_ch_diff(uuid, text, text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.mark_lead_dormant(p_lead_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.leads WHERE id = p_lead_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF NOT user_has_organization_access(v_org) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
  VALUES (v_org, 'LEAD_DORMANT', 'lead', p_lead_id, jsonb_build_object('reason', p_reason));
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_lead_dormant(uuid, text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.mark_lead_lost(p_lead_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.leads WHERE id = p_lead_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF NOT user_has_organization_access(v_org) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  UPDATE public.leads SET pipeline_stage = 'lost', lost_at = now(),
                          lost_reason = coalesce(p_reason, lost_reason)
   WHERE id = p_lead_id;
  INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
  VALUES (v_org, 'LEAD_LOST', 'lead', p_lead_id, jsonb_build_object('reason', p_reason));
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_lead_lost(uuid, text) TO authenticated, service_role;
