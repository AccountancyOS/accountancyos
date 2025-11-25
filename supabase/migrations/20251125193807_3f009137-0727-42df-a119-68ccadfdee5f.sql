-- Create team_invitations table for pending staff invitations
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  invited_by UUID NOT NULL,
  invited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(organization_id, email)
);

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invitations in their organization"
  ON public.team_invitations FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Admins and owners can create invitations"
  ON public.team_invitations FOR INSERT
  WITH CHECK (
    user_has_organization_access(organization_id) AND
    has_organization_role('owner') OR has_organization_role('admin')
  );

CREATE POLICY "Admins and owners can delete invitations"
  ON public.team_invitations FOR DELETE
  USING (
    user_has_organization_access(organization_id) AND
    (has_organization_role('owner') OR has_organization_role('admin'))
  );

-- Create deadline calculation function
CREATE OR REPLACE FUNCTION public.calculate_deadline(
  filing_type TEXT,
  period_start DATE,
  period_end DATE,
  metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result_date DATE;
  ard DATE;
  made_up_date DATE;
  quarter_end DATE;
BEGIN
  CASE filing_type
    WHEN 'companies_house_accounts' THEN
      -- Accounts filing deadline = ARD + 9 months
      ard := (metadata->>'accounting_reference_date')::DATE;
      IF ard IS NULL THEN
        ard := period_end;
      END IF;
      result_date := ard + INTERVAL '9 months';
      
    WHEN 'companies_house_confirmation' THEN
      -- Confirmation statement deadline = made-up-date + 12 months
      made_up_date := (metadata->>'made_up_date')::DATE;
      IF made_up_date IS NULL THEN
        made_up_date := period_end;
      END IF;
      result_date := made_up_date + INTERVAL '12 months';
      
    WHEN 'corporation_tax_filing' THEN
      -- CT filing deadline = ARD + 12 months
      ard := (metadata->>'accounting_reference_date')::DATE;
      IF ard IS NULL THEN
        ard := period_end;
      END IF;
      result_date := ard + INTERVAL '12 months';
      
    WHEN 'corporation_tax_payment' THEN
      -- CT payment = ARD + 9 months + 1 day
      ard := (metadata->>'accounting_reference_date')::DATE;
      IF ard IS NULL THEN
        ard := period_end;
      END IF;
      result_date := ard + INTERVAL '9 months' + INTERVAL '1 day';
      
    WHEN 'self_assessment' THEN
      -- Filing deadline: 31 January following tax year end
      result_date := DATE_TRUNC('year', period_end)::DATE + INTERVAL '1 year' + INTERVAL '1 month' - INTERVAL '1 day';
      IF EXTRACT(MONTH FROM period_end) < 4 THEN
        result_date := result_date - INTERVAL '1 year';
      END IF;
      
    WHEN 'vat_return' THEN
      -- Deadline = quarter_end + 1 month + 7 days
      quarter_end := period_end;
      result_date := quarter_end + INTERVAL '1 month' + INTERVAL '7 days';
      
    WHEN 'payroll_fps' THEN
      -- FPS due: on or before payday
      result_date := period_end;
      
    WHEN 'payroll_eps' THEN
      -- EPS due: by 19th after tax month
      result_date := DATE_TRUNC('month', period_end)::DATE + INTERVAL '1 month' + INTERVAL '18 days';
      
    ELSE
      -- Default fallback
      result_date := period_end + INTERVAL '1 month';
  END CASE;
  
  RETURN result_date;
END;
$$;

-- Seed standard UK accounting services (using only monthly, hourly, fixed)
INSERT INTO public.services_catalog (organization_id, code, name, description, billing_model, default_price, is_bookkeeping_related, active)
SELECT 
  o.id,
  s.code,
  s.name,
  s.description,
  s.billing_model,
  s.default_price,
  s.is_bookkeeping_related,
  true
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('BK-MONTHLY', 'Monthly Bookkeeping', 'Full bookkeeping service with monthly management accounts', 'monthly', 300.00, true),
    ('BK-ANNUAL', 'Annual Bookkeeping', 'Year-end bookkeeping and accounts preparation', 'fixed', 1500.00, true),
    ('VAT-RETURN', 'VAT Return Preparation', 'Quarterly VAT return preparation and submission', 'fixed', 150.00, false),
    ('PAYROLL', 'Payroll Services', 'Monthly payroll processing and RTI submissions', 'monthly', 50.00, false),
    ('ANNUAL-ACC', 'Annual Accounts', 'Preparation of statutory annual accounts', 'fixed', 800.00, false),
    ('CT600', 'Corporation Tax Return', 'CT600 preparation and submission', 'fixed', 400.00, false),
    ('SA-RETURN', 'Self Assessment Tax Return', 'Personal tax return preparation and filing', 'fixed', 250.00, false),
    ('TAX-PLAN', 'Tax Planning Consultation', 'Strategic tax planning and advice', 'hourly', 150.00, false),
    ('CONFIRM-STMT', 'Confirmation Statement Filing', 'Companies House confirmation statement filing', 'fixed', 50.00, false),
    ('COMPANY-SETUP', 'Company Formation', 'New company incorporation service', 'fixed', 100.00, false)
) AS s(code, name, description, billing_model, default_price, is_bookkeeping_related)
WHERE NOT EXISTS (
  SELECT 1 FROM public.services_catalog sc 
  WHERE sc.organization_id = o.id AND sc.code = s.code
);