
-- Wave 2: CRM & Operational Data

-- 1. Add compliance fields to contacts
ALTER TABLE public.contacts 
  ADD COLUMN IF NOT EXISTS nino text,
  ADD COLUMN IF NOT EXISTS utr text,
  ADD COLUMN IF NOT EXISTS dob date,
  ADD COLUMN IF NOT EXISTS ch_personal_code text;

-- 2. CRM Activity Logging (Pipedrive-style)
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('note', 'call', 'email', 'meeting', 'task', 'follow_up')),
  subject text NOT NULL DEFAULT '',
  description text,
  due_date timestamptz,
  completed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view activities"
ON public.crm_activities FOR SELECT TO authenticated
USING (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Org members can create activities"
ON public.crm_activities FOR INSERT TO authenticated
WITH CHECK (user_in_organization(auth.uid(), organization_id) AND created_by = auth.uid());

CREATE POLICY "Creator or admin can update activities"
ON public.crm_activities FOR UPDATE TO authenticated
USING (
  created_by = auth.uid() 
  OR user_role_is_at_least(auth.uid(), organization_id, 'admin')
);

CREATE POLICY "Creator or admin can delete activities"
ON public.crm_activities FOR DELETE TO authenticated
USING (
  created_by = auth.uid() 
  OR user_role_is_at_least(auth.uid(), organization_id, 'admin')
);

CREATE INDEX idx_crm_activities_lead ON public.crm_activities(lead_id);
CREATE INDEX idx_crm_activities_org ON public.crm_activities(organization_id);

-- 3. Bookkeeping Audit Log (append-only)
CREATE TABLE IF NOT EXISTS public.bookkeeping_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL, -- 'invoice', 'bill', 'journal', 'payment', 'ledger_entry'
  entity_id uuid NOT NULL,
  action text NOT NULL, -- 'created', 'issued', 'voided', 'paid', 'reversed', 'overridden'
  actor_id uuid,
  actor_role text,
  before_state jsonb,
  after_state jsonb,
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bookkeeping_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view bookkeeping audit"
ON public.bookkeeping_audit_log FOR SELECT TO authenticated
USING (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Insert only via system"
ON public.bookkeeping_audit_log FOR INSERT TO authenticated
WITH CHECK (user_in_organization(auth.uid(), organization_id));

-- Block updates and deletes (immutable)
CREATE POLICY "No updates allowed"
ON public.bookkeeping_audit_log FOR UPDATE TO authenticated
USING (false);

CREATE POLICY "No deletes allowed"
ON public.bookkeeping_audit_log FOR DELETE TO authenticated
USING (false);

CREATE INDEX idx_bk_audit_entity ON public.bookkeeping_audit_log(entity_type, entity_id);
CREATE INDEX idx_bk_audit_org ON public.bookkeeping_audit_log(organization_id);

-- 4. Payroll Journal Mapping
CREATE TABLE IF NOT EXISTS public.payroll_journal_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_category text NOT NULL, -- 'gross_pay', 'employer_ni', 'employee_ni', 'paye', 'pension_employer', 'pension_employee', 'student_loan', 'net_pay'
  debit_account_id uuid REFERENCES public.bookkeeping_accounts(id),
  credit_account_id uuid REFERENCES public.bookkeeping_accounts(id),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, payroll_category)
);

ALTER TABLE public.payroll_journal_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view payroll mapping"
ON public.payroll_journal_mapping FOR SELECT TO authenticated
USING (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Admin+ can manage payroll mapping"
ON public.payroll_journal_mapping FOR INSERT TO authenticated
WITH CHECK (user_role_is_at_least(auth.uid(), organization_id, 'admin'));

CREATE POLICY "Admin+ can update payroll mapping"
ON public.payroll_journal_mapping FOR UPDATE TO authenticated
USING (user_role_is_at_least(auth.uid(), organization_id, 'admin'));

CREATE POLICY "Admin+ can delete payroll mapping"
ON public.payroll_journal_mapping FOR DELETE TO authenticated
USING (user_role_is_at_least(auth.uid(), organization_id, 'admin'));

-- 5. Auto-update timestamps trigger for new tables
CREATE TRIGGER update_crm_activities_updated_at
  BEFORE UPDATE ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payroll_journal_mapping_updated_at
  BEFORE UPDATE ON public.payroll_journal_mapping
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
