-- =====================================================================================
-- Client Data Governance Architecture — G1: schema foundation
-- =====================================================================================
-- Spec: docs/superpowers/specs/2026-07-22-data-governance-architecture-design.md
--
-- Values of record stay in the existing typed columns (companies, company_persons,
-- clients, client_detail_*). This layer tracks REQUIREMENT / STATUS / SOURCE /
-- VERIFICATION per (subject, field) and the change/audit lifecycle on top of them —
-- it does NOT store field values itself. Additive/idempotent; safe to re-run.
--
-- Tables:
--   1. data_requirements            — governed-field catalog (org-agnostic reference data)
--   2. data_point_state             — per-subject governance state for each field
--   3. data_change_requests         — controlled-mutation lifecycle for sensitive edits
--   4. data_audit_log               — append-only field-level audit trail
--   5. onboarding_approval_snapshots — append-only immutable approval snapshots
--
-- RLS mirrors the codebase-standard pattern: public.user_has_organization_access(org_id)
-- (SECURITY DEFINER, defined in 20251125171101) gates every org-scoped table, applied via
-- the same select/insert/update/delete four-policy shape used by
-- engagement_letter_template_variants / kyc_packs / kyc_pack_subjects (20260601064530).
-- =====================================================================================

-- ---------------------------------------------------------------------------
-- 1. data_requirements — the governed-field catalog
-- ---------------------------------------------------------------------------
-- Org-agnostic reference data (one row per governed field_key, not per org). Mirrored
-- code-side by src/lib/data-requirements-model.ts::DATA_REQUIREMENTS (the two must be
-- kept in sync; the code-side copy is what onboarding/portal/reporting consult at
-- runtime, this table is the durable/queryable registration of the same catalog).
CREATE TABLE IF NOT EXISTS public.data_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key TEXT NOT NULL UNIQUE,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('company', 'client', 'person')),
  -- Entity types this field applies to (values from src/lib/client-types.ts CLIENT_TYPES,
  -- e.g. 'limited_company', 'llp', 'sa_non_mtd'). Empty array = applies to all types.
  applies_entity_types TEXT[] NOT NULL DEFAULT '{}',
  -- Nullable service condition (e.g. 'vat', 'payroll'). NULL = always applicable;
  -- non-null = only required when that service is engaged for the subject.
  applies_service_condition TEXT,
  sensitivity TEXT NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal', 'sensitive')),
  provider TEXT NOT NULL CHECK (provider IN ('client', 'firm', 'companies_house')),
  requires_verification BOOLEAN NOT NULL DEFAULT false,
  authoritative_table TEXT NOT NULL,
  authoritative_column TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.data_requirements IS
  'Governed-field catalog: the data points the platform governs (requirement/sensitivity/provider/verification), each mapped to its authoritative typed column. Does NOT store values. Org-agnostic reference data — code-side source of truth is src/lib/data-requirements-model.ts.';
COMMENT ON COLUMN public.data_requirements.applies_entity_types IS
  'Client/entity type codes (src/lib/client-types.ts CLIENT_TYPES) this field applies to. Empty array = all types.';
COMMENT ON COLUMN public.data_requirements.applies_service_condition IS
  'NULL = always required; otherwise a service code (e.g. vat, payroll) — the field is only required when that service is engaged.';

ALTER TABLE public.data_requirements ENABLE ROW LEVEL SECURITY;

-- Reference catalog: any authenticated user may read it (drives onboarding/portal/
-- reporting UI everywhere); mutation is reserved for service_role (which bypasses RLS)
-- so no INSERT/UPDATE/DELETE policy is granted to authenticated/anon here by design.
DROP POLICY IF EXISTS "data_requirements_select" ON public.data_requirements;
CREATE POLICY "data_requirements_select" ON public.data_requirements
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 2. data_point_state — per (subject, field) governance state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_point_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('company', 'client', 'person')),
  subject_id UUID NOT NULL,
  field_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'outstanding' CHECK (status IN (
    'outstanding', 'provided', 'pending_verification', 'verified', 'rejected', 'not_applicable'
  )),
  source TEXT CHECK (source IN ('client', 'firm', 'companies_house')),
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_data_point_state_subject_field UNIQUE (organization_id, subject_kind, subject_id, field_key)
);

COMMENT ON TABLE public.data_point_state IS
  'Governance state (status/source/verification) of one governed field for one subject. The value itself lives in the mapped authoritative typed column (see data_requirements) — this row never stores it.';

CREATE INDEX IF NOT EXISTS idx_data_point_state_org_subject
  ON public.data_point_state (organization_id, subject_kind, subject_id);
CREATE INDEX IF NOT EXISTS idx_data_point_state_org_status
  ON public.data_point_state (organization_id, status);

ALTER TABLE public.data_point_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_point_state_select" ON public.data_point_state;
CREATE POLICY "data_point_state_select" ON public.data_point_state
  FOR SELECT TO authenticated USING (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "data_point_state_insert" ON public.data_point_state;
CREATE POLICY "data_point_state_insert" ON public.data_point_state
  FOR INSERT TO authenticated WITH CHECK (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "data_point_state_update" ON public.data_point_state;
CREATE POLICY "data_point_state_update" ON public.data_point_state
  FOR UPDATE TO authenticated USING (user_has_organization_access(organization_id)) WITH CHECK (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "data_point_state_delete" ON public.data_point_state;
CREATE POLICY "data_point_state_delete" ON public.data_point_state
  FOR DELETE TO authenticated USING (user_has_organization_access(organization_id));

-- ---------------------------------------------------------------------------
-- 3. data_change_requests — controlled-mutation lifecycle
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('company', 'client', 'person')),
  subject_id UUID NOT NULL,
  field_key TEXT NOT NULL,
  -- Masked at rest for sensitive fields (see data_requirements.sensitivity); the raw
  -- value is never persisted in this governance layer.
  proposed_value_masked TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('onboarding', 'portal', 'staff')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted', 'needs_more_info', 'approved', 'rejected'
  )),
  requested_by UUID REFERENCES auth.users(id),
  reason TEXT,
  evidence_ref TEXT,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.data_change_requests IS
  'A submitted change to an authoritative value, pending staff review. The verified value stays authoritative until approved. Non-sensitive contact/address edits bypass this and apply immediately (audited); sensitive/identity/tax fields MUST route through here.';

CREATE INDEX IF NOT EXISTS idx_data_change_requests_org_status
  ON public.data_change_requests (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_data_change_requests_org_subject
  ON public.data_change_requests (organization_id, subject_kind, subject_id);

ALTER TABLE public.data_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_change_requests_select" ON public.data_change_requests;
CREATE POLICY "data_change_requests_select" ON public.data_change_requests
  FOR SELECT TO authenticated USING (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "data_change_requests_insert" ON public.data_change_requests;
CREATE POLICY "data_change_requests_insert" ON public.data_change_requests
  FOR INSERT TO authenticated WITH CHECK (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "data_change_requests_update" ON public.data_change_requests;
CREATE POLICY "data_change_requests_update" ON public.data_change_requests
  FOR UPDATE TO authenticated USING (user_has_organization_access(organization_id)) WITH CHECK (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "data_change_requests_delete" ON public.data_change_requests;
CREATE POLICY "data_change_requests_delete" ON public.data_change_requests
  FOR DELETE TO authenticated USING (user_has_organization_access(organization_id));

-- ---------------------------------------------------------------------------
-- 4. data_audit_log — append-only, field-level audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('company', 'client', 'person')),
  subject_id UUID NOT NULL,
  field_key TEXT NOT NULL,
  old_value_masked TEXT,
  new_value_masked TEXT,
  actor UUID REFERENCES auth.users(id),
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  origin TEXT,
  decision TEXT,
  change_request_id UUID REFERENCES public.data_change_requests(id) ON DELETE SET NULL,
  -- 'reveal' covers sensitive-access events (unmasking NINO/UTR/DOB/home-address in the
  -- UI) in addition to material data changes (create/update/approve/reject).
  event_type TEXT NOT NULL
);

COMMENT ON TABLE public.data_audit_log IS
  'System of record for "who changed/accessed what, when, from where, why." Append-only: no UPDATE/DELETE policy is granted, and a BEFORE UPDATE OR DELETE trigger raises to enforce it even for the table owner. Sensitive old/new values are stored masked, never raw.';

CREATE INDEX IF NOT EXISTS idx_data_audit_log_org_subject
  ON public.data_audit_log (organization_id, subject_kind, subject_id, field_key);
CREATE INDEX IF NOT EXISTS idx_data_audit_log_org_at
  ON public.data_audit_log (organization_id, at DESC);

ALTER TABLE public.data_audit_log ENABLE ROW LEVEL SECURITY;

-- INSERT + SELECT only — no UPDATE/DELETE policy exists for any role, so RLS alone
-- already blocks mutation for authenticated/anon. The trigger below closes the gap for
-- service_role / table owner, which bypasses RLS.
DROP POLICY IF EXISTS "data_audit_log_select" ON public.data_audit_log;
CREATE POLICY "data_audit_log_select" ON public.data_audit_log
  FOR SELECT TO authenticated USING (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "data_audit_log_insert" ON public.data_audit_log;
CREATE POLICY "data_audit_log_insert" ON public.data_audit_log
  FOR INSERT TO authenticated WITH CHECK (user_has_organization_access(organization_id));

CREATE OR REPLACE FUNCTION public.data_audit_log_prevent_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
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

-- ---------------------------------------------------------------------------
-- 5. onboarding_approval_snapshots — immutable approved-onboarding snapshot
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_approval_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  application_id UUID NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.onboarding_approval_snapshots IS
  'Immutable JSON snapshot of exactly what was approved on onboarding approval (provisional data + resolved person identities + field-level decisions). Never mutated; referenced by data_audit_log rows. Written by the G2 approve_onboarding_transactional RPC.';

CREATE INDEX IF NOT EXISTS idx_onboarding_approval_snapshots_org_app
  ON public.onboarding_approval_snapshots (organization_id, application_id);

ALTER TABLE public.onboarding_approval_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_approval_snapshots_select" ON public.onboarding_approval_snapshots;
CREATE POLICY "onboarding_approval_snapshots_select" ON public.onboarding_approval_snapshots
  FOR SELECT TO authenticated USING (user_has_organization_access(organization_id));
DROP POLICY IF EXISTS "onboarding_approval_snapshots_insert" ON public.onboarding_approval_snapshots;
CREATE POLICY "onboarding_approval_snapshots_insert" ON public.onboarding_approval_snapshots
  FOR INSERT TO authenticated WITH CHECK (user_has_organization_access(organization_id));

DROP TRIGGER IF EXISTS trg_onboarding_approval_snapshots_append_only ON public.onboarding_approval_snapshots;
CREATE TRIGGER trg_onboarding_approval_snapshots_append_only
  BEFORE UPDATE OR DELETE ON public.onboarding_approval_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.data_audit_log_prevent_mutation();

-- ---------------------------------------------------------------------------
-- Seed: known governed fields
-- ---------------------------------------------------------------------------
-- Mirrors src/lib/data-requirements-model.ts::DATA_REQUIREMENTS. Keep both in sync.
INSERT INTO public.data_requirements
  (field_key, subject_kind, applies_entity_types, applies_service_condition, sensitivity, provider, requires_verification, authoritative_table, authoritative_column)
VALUES
  ('person.nino', 'person', '{}', NULL, 'sensitive', 'client', true, 'company_persons', 'nino'),
  ('person.utr', 'person', '{}', NULL, 'sensitive', 'client', true, 'company_persons', 'utr'),
  ('person.date_of_birth', 'person', '{}', NULL, 'sensitive', 'client', true, 'company_persons', 'date_of_birth'),
  ('person.home_address', 'person', '{}', NULL, 'sensitive', 'client', true, 'company_persons', 'residential_address_line_1'),
  ('company.utr', 'company', '{}', NULL, 'normal', 'client', false, 'companies', 'utr'),
  ('company.vat_number', 'company', '{}', 'vat', 'normal', 'client', false, 'companies', 'vat_number'),
  -- PAYE reference lives on paye_schemes.employer_paye_reference (one-to-many child of
  -- the company), not a scalar on companies. Anchor points at the real column; G2/G7
  -- resolve the actual scheme row (a paye_schemes insert also requires `name`).
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
