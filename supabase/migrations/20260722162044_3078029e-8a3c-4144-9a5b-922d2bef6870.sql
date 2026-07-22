-- G1: data governance foundation
CREATE TABLE IF NOT EXISTS public.data_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key TEXT NOT NULL UNIQUE,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('company','client','person')),
  applies_entity_types TEXT[] NOT NULL DEFAULT '{}',
  applies_service_condition TEXT,
  sensitivity TEXT NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal','sensitive')),
  provider TEXT NOT NULL CHECK (provider IN ('client','firm','companies_house')),
  requires_verification BOOLEAN NOT NULL DEFAULT false,
  authoritative_table TEXT NOT NULL,
  authoritative_column TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.data_requirements TO authenticated;
GRANT ALL ON public.data_requirements TO service_role;
ALTER TABLE public.data_requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "data_requirements_select" ON public.data_requirements;
CREATE POLICY "data_requirements_select" ON public.data_requirements
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.data_point_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('company','client','person')),
  subject_id UUID NOT NULL,
  field_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'outstanding' CHECK (status IN (
    'outstanding','provided','pending_verification','verified','rejected','not_applicable'
  )),
  source TEXT CHECK (source IN ('client','firm','companies_house')),
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_data_point_state_subject_field UNIQUE (organization_id, subject_kind, subject_id, field_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_point_state TO authenticated;
GRANT ALL ON public.data_point_state TO service_role;
CREATE INDEX IF NOT EXISTS idx_data_point_state_org_subject ON public.data_point_state (organization_id, subject_kind, subject_id);
CREATE INDEX IF NOT EXISTS idx_data_point_state_org_status ON public.data_point_state (organization_id, status);
ALTER TABLE public.data_point_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "data_point_state_select" ON public.data_point_state;
CREATE POLICY "data_point_state_select" ON public.data_point_state FOR SELECT TO authenticated USING (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "data_point_state_insert" ON public.data_point_state;
CREATE POLICY "data_point_state_insert" ON public.data_point_state FOR INSERT TO authenticated WITH CHECK (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "data_point_state_update" ON public.data_point_state;
CREATE POLICY "data_point_state_update" ON public.data_point_state FOR UPDATE TO authenticated USING (user_has_organization_access(organization_id)) WITH CHECK (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "data_point_state_delete" ON public.data_point_state;
CREATE POLICY "data_point_state_delete" ON public.data_point_state FOR DELETE TO authenticated USING (user_has_organization_access(organization_id));

CREATE TABLE IF NOT EXISTS public.data_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('company','client','person')),
  subject_id UUID NOT NULL,
  field_key TEXT NOT NULL,
  proposed_value_masked TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('onboarding','portal','staff')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','needs_more_info','approved','rejected')),
  requested_by UUID REFERENCES auth.users(id),
  reason TEXT,
  evidence_ref TEXT,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_change_requests TO authenticated;
GRANT ALL ON public.data_change_requests TO service_role;
CREATE INDEX IF NOT EXISTS idx_data_change_requests_org_status ON public.data_change_requests (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_data_change_requests_org_subject ON public.data_change_requests (organization_id, subject_kind, subject_id);
ALTER TABLE public.data_change_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "data_change_requests_select" ON public.data_change_requests;
CREATE POLICY "data_change_requests_select" ON public.data_change_requests FOR SELECT TO authenticated USING (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "data_change_requests_insert" ON public.data_change_requests;
CREATE POLICY "data_change_requests_insert" ON public.data_change_requests FOR INSERT TO authenticated WITH CHECK (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "data_change_requests_update" ON public.data_change_requests;
CREATE POLICY "data_change_requests_update" ON public.data_change_requests FOR UPDATE TO authenticated USING (user_has_organization_access(organization_id)) WITH CHECK (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "data_change_requests_delete" ON public.data_change_requests;
CREATE POLICY "data_change_requests_delete" ON public.data_change_requests FOR DELETE TO authenticated USING (user_has_organization_access(organization_id));

CREATE TABLE IF NOT EXISTS public.data_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('company','client','person')),
  subject_id UUID NOT NULL,
  field_key TEXT NOT NULL,
  old_value_masked TEXT,
  new_value_masked TEXT,
  actor UUID REFERENCES auth.users(id),
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  origin TEXT,
  decision TEXT,
  change_request_id UUID REFERENCES public.data_change_requests(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
);
GRANT SELECT, INSERT ON public.data_audit_log TO authenticated;
GRANT ALL ON public.data_audit_log TO service_role;
CREATE INDEX IF NOT EXISTS idx_data_audit_log_org_subject ON public.data_audit_log (organization_id, subject_kind, subject_id, field_key);
CREATE INDEX IF NOT EXISTS idx_data_audit_log_org_at ON public.data_audit_log (organization_id, at DESC);
ALTER TABLE public.data_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "data_audit_log_select" ON public.data_audit_log;
CREATE POLICY "data_audit_log_select" ON public.data_audit_log FOR SELECT TO authenticated USING (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "data_audit_log_insert" ON public.data_audit_log;
CREATE POLICY "data_audit_log_insert" ON public.data_audit_log FOR INSERT TO authenticated WITH CHECK (user_has_organization_access(organization_id));

CREATE OR REPLACE FUNCTION public.data_audit_log_prevent_mutation()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path TO 'public','extensions'
AS $$
BEGIN
  RAISE EXCEPTION 'data_audit_log is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_data_audit_log_append_only ON public.data_audit_log;
CREATE TRIGGER trg_data_audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.data_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.data_audit_log_prevent_mutation();

CREATE TABLE IF NOT EXISTS public.onboarding_approval_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  application_id UUID NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT ON public.onboarding_approval_snapshots TO authenticated;
GRANT ALL ON public.onboarding_approval_snapshots TO service_role;
CREATE INDEX IF NOT EXISTS idx_onboarding_approval_snapshots_org_app ON public.onboarding_approval_snapshots (organization_id, application_id);
ALTER TABLE public.onboarding_approval_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "onboarding_approval_snapshots_select" ON public.onboarding_approval_snapshots;
CREATE POLICY "onboarding_approval_snapshots_select" ON public.onboarding_approval_snapshots FOR SELECT TO authenticated USING (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "onboarding_approval_snapshots_insert" ON public.onboarding_approval_snapshots;
CREATE POLICY "onboarding_approval_snapshots_insert" ON public.onboarding_approval_snapshots FOR INSERT TO authenticated WITH CHECK (user_has_organization_access(organization_id));
DROP TRIGGER IF EXISTS trg_onboarding_approval_snapshots_append_only ON public.onboarding_approval_snapshots;
CREATE TRIGGER trg_onboarding_approval_snapshots_append_only
  BEFORE UPDATE OR DELETE ON public.onboarding_approval_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.data_audit_log_prevent_mutation();

INSERT INTO public.data_requirements
  (field_key, subject_kind, applies_entity_types, applies_service_condition, sensitivity, provider, requires_verification, authoritative_table, authoritative_column)
VALUES
  ('person.nino', 'person', '{}', NULL, 'sensitive', 'client', true, 'company_persons', 'nino'),
  ('person.utr', 'person', '{}', NULL, 'sensitive', 'client', true, 'company_persons', 'utr'),
  ('person.date_of_birth', 'person', '{}', NULL, 'sensitive', 'client', true, 'company_persons', 'date_of_birth'),
  ('person.home_address', 'person', '{}', NULL, 'sensitive', 'client', true, 'company_persons', 'residential_address_line_1'),
  ('company.utr', 'company', '{}', NULL, 'normal', 'client', false, 'companies', 'utr'),
  ('company.vat_number', 'company', '{}', 'vat', 'normal', 'client', false, 'companies', 'vat_number'),
  ('company.paye_reference', 'company', '{}', 'payroll', 'normal', 'client', false, 'paye_schemes', 'employer_paye_reference'),
  ('company.registered_office', 'company', '{}', NULL, 'normal', 'companies_house', false, 'companies', 'registered_office_address'),
  ('company.trading_address', 'company', '{}', NULL, 'normal', 'firm', false, 'companies', 'trading_address')
ON CONFLICT (field_key) DO UPDATE SET
  subject_kind = EXCLUDED.subject_kind,
  applies_entity_types = EXCLUDED.applies_entity_types,
  applies_service_condition = EXCLUDED.applies_service_condition,
  sensitivity = EXCLUDED.sensitivity,
  provider = EXCLUDED.provider,
  requires_verification = EXCLUDED.requires_verification,
  authoritative_table = EXCLUDED.authoritative_table,
  authoritative_column = EXCLUDED.authoritative_column,
  updated_at = now();