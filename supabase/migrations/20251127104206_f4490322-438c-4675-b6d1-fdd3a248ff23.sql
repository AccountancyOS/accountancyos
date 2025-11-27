-- VAT Returns table
CREATE TABLE public.vat_returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID REFERENCES public.clients(id),
  company_id UUID REFERENCES public.companies(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  box_1_vat_due_sales NUMERIC NOT NULL DEFAULT 0,
  box_2_vat_due_acquisitions NUMERIC NOT NULL DEFAULT 0,
  box_3_total_vat_due NUMERIC NOT NULL DEFAULT 0,
  box_4_vat_reclaimed NUMERIC NOT NULL DEFAULT 0,
  box_5_net_vat NUMERIC NOT NULL DEFAULT 0,
  box_6_total_sales NUMERIC NOT NULL DEFAULT 0,
  box_7_total_purchases NUMERIC NOT NULL DEFAULT 0,
  box_8_total_supplies_eu NUMERIC NOT NULL DEFAULT 0,
  box_9_total_acquisitions_eu NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  submitted_by UUID,
  hmrc_receipt JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT vat_returns_entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- Period Locks table
CREATE TABLE public.period_locks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID REFERENCES public.clients(id),
  company_id UUID REFERENCES public.companies(id),
  lock_date DATE NOT NULL,
  locked_by UUID,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT,
  CONSTRAINT period_locks_entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  ),
  CONSTRAINT period_locks_unique_entity UNIQUE (organization_id, client_id, company_id)
);

-- RLS for vat_returns
ALTER TABLE public.vat_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view VAT returns in their organization"
  ON public.vat_returns FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can manage VAT returns in their organization"
  ON public.vat_returns FOR ALL
  USING (user_has_organization_access(organization_id))
  WITH CHECK (user_has_organization_access(organization_id));

-- RLS for period_locks
ALTER TABLE public.period_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view period locks in their organization"
  ON public.period_locks FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Admins can manage period locks"
  ON public.period_locks FOR ALL
  USING (user_has_organization_access(organization_id) AND (has_organization_role('owner') OR has_organization_role('admin')))
  WITH CHECK (user_has_organization_access(organization_id) AND (has_organization_role('owner') OR has_organization_role('admin')));

-- Indexes
CREATE INDEX idx_vat_returns_entity ON public.vat_returns(organization_id, client_id, company_id);
CREATE INDEX idx_vat_returns_period ON public.vat_returns(period_start, period_end);
CREATE INDEX idx_period_locks_entity ON public.period_locks(organization_id, client_id, company_id);