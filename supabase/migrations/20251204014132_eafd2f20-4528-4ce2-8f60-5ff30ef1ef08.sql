
-- =====================================================
-- PHASE 6.1: Company Secretarial Schema Migration
-- =====================================================

-- =====================================================
-- 1. COMPANY_PERSONS TABLE (Central Person Registry)
-- =====================================================
CREATE TABLE public.company_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  linked_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  
  -- Core identity
  title TEXT,
  first_name TEXT NOT NULL,
  middle_names TEXT,
  last_name TEXT NOT NULL,
  former_names JSONB DEFAULT '[]'::jsonb,
  
  -- CH-specific fields (full data, redacted for outputs)
  date_of_birth DATE,
  nationality TEXT,
  country_of_residence TEXT,
  occupation TEXT,
  
  -- Residential address (private, never exposed publicly)
  residential_address_line_1 TEXT,
  residential_address_line_2 TEXT,
  residential_city TEXT,
  residential_county TEXT,
  residential_postcode TEXT,
  residential_country TEXT DEFAULT 'United Kingdom',
  
  -- Service address (can be shown publicly)
  service_address_line_1 TEXT,
  service_address_line_2 TEXT,
  service_city TEXT,
  service_county TEXT,
  service_postcode TEXT,
  service_country TEXT DEFAULT 'United Kingdom',
  use_registered_office_as_service BOOLEAN DEFAULT false,
  
  -- Contact
  email TEXT,
  phone TEXT,
  
  -- CH sync
  ch_officer_id TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 2. COMPANY_OFFICERS TABLE
-- =====================================================
CREATE TABLE public.company_officers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.company_persons(id) ON DELETE CASCADE,
  
  role TEXT NOT NULL CHECK (role IN ('director', 'secretary', 'llp_member', 'llp_designated_member')),
  appointed_at DATE NOT NULL,
  resigned_at DATE,
  
  -- CH sync
  ch_appointment_id TEXT,
  ch_links JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 3. COMPANY_PSCS TABLE (Persons with Significant Control)
-- =====================================================
CREATE TABLE public.company_pscs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.company_persons(id) ON DELETE CASCADE,
  
  -- Nature of control (CH codes as text array, validated at app level)
  nature_of_control TEXT[] NOT NULL DEFAULT '{}',
  
  notified_at DATE NOT NULL,
  ceased_at DATE,
  
  -- CH sync
  ch_psc_id TEXT,
  ch_links JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 4. COMPANY_SHARE_CLASSES TABLE
-- =====================================================
CREATE TABLE public.company_share_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  class_name TEXT NOT NULL,
  nominal_value NUMERIC(15,4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  
  -- Rights description
  rights_description TEXT,
  voting_rights BOOLEAN DEFAULT true,
  dividend_rights BOOLEAN DEFAULT true,
  capital_rights BOOLEAN DEFAULT true,
  
  -- Totals (updated by triggers)
  total_shares_issued NUMERIC(15,0) NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (company_id, class_name)
);

-- =====================================================
-- 5. COMPANY_SHAREHOLDERS TABLE (Current Snapshot)
-- =====================================================
CREATE TABLE public.company_shareholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.company_persons(id) ON DELETE CASCADE,
  share_class_id UUID NOT NULL REFERENCES public.company_share_classes(id) ON DELETE CASCADE,
  
  -- Derived from allotments/transfers (maintained by triggers)
  shares_held NUMERIC(15,0) NOT NULL DEFAULT 0,
  as_at_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (company_id, person_id, share_class_id)
);

-- =====================================================
-- 6. COMPANY_SHARE_ALLOTMENTS TABLE (Transaction Log)
-- =====================================================
CREATE TABLE public.company_share_allotments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  share_class_id UUID NOT NULL REFERENCES public.company_share_classes(id) ON DELETE CASCADE,
  shareholder_id UUID NOT NULL REFERENCES public.company_shareholders(id) ON DELETE CASCADE,
  
  shares_allotted NUMERIC(15,0) NOT NULL,
  price_per_share NUMERIC(15,4),
  total_consideration NUMERIC(15,2),
  allotment_date DATE NOT NULL,
  
  -- Filing reference
  filing_id UUID REFERENCES public.filings(id) ON DELETE SET NULL,
  workpaper_instance_id UUID REFERENCES public.workpaper_instances(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 7. COMPANY_SHARE_TRANSFERS TABLE (Transaction Log)
-- =====================================================
CREATE TABLE public.company_share_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  share_class_id UUID NOT NULL REFERENCES public.company_share_classes(id) ON DELETE CASCADE,
  
  from_shareholder_id UUID NOT NULL REFERENCES public.company_shareholders(id) ON DELETE CASCADE,
  to_shareholder_id UUID NOT NULL REFERENCES public.company_shareholders(id) ON DELETE CASCADE,
  
  shares_transferred NUMERIC(15,0) NOT NULL,
  transfer_date DATE NOT NULL,
  consideration NUMERIC(15,2),
  
  -- Filing reference
  filing_id UUID REFERENCES public.filings(id) ON DELETE SET NULL,
  workpaper_instance_id UUID REFERENCES public.workpaper_instances(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CHECK (from_shareholder_id != to_shareholder_id)
);

-- =====================================================
-- 8. COMPANY_REGISTER_EVENTS TABLE (Audit Log)
-- =====================================================
CREATE TABLE public.company_register_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL CHECK (event_type IN (
    'appointment', 'termination', 'resignation',
    'psc_added', 'psc_ceased', 'psc_updated',
    'allotment', 'transfer',
    'share_class_created', 'share_class_updated',
    'registered_office_changed', 'sic_codes_changed',
    'confirmation_statement_filed', 'ch_sync'
  )),
  event_date DATE NOT NULL,
  
  -- Source tracking
  source TEXT NOT NULL DEFAULT 'workpaper' CHECK (source IN ('ch_sync', 'workpaper', 'manual', 'migration')),
  
  -- Details
  details JSONB NOT NULL DEFAULT '{}',
  
  -- References
  person_id UUID REFERENCES public.company_persons(id) ON DELETE SET NULL,
  officer_id UUID REFERENCES public.company_officers(id) ON DELETE SET NULL,
  psc_id UUID REFERENCES public.company_pscs(id) ON DELETE SET NULL,
  shareholder_id UUID REFERENCES public.company_shareholders(id) ON DELETE SET NULL,
  allotment_id UUID REFERENCES public.company_share_allotments(id) ON DELETE SET NULL,
  transfer_id UUID REFERENCES public.company_share_transfers(id) ON DELETE SET NULL,
  workpaper_instance_id UUID REFERENCES public.workpaper_instances(id) ON DELETE SET NULL,
  filing_id UUID REFERENCES public.filings(id) ON DELETE SET NULL,
  
  -- User who made the change
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 9. ALTER COMPANIES TABLE - Add CH Fields
-- =====================================================
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS registered_office_address JSONB,
ADD COLUMN IF NOT EXISTS sic_codes JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS company_type TEXT,
ADD COLUMN IF NOT EXISTS confirmation_statement_made_up_to DATE,
ADD COLUMN IF NOT EXISTS confirmation_statement_next_due DATE,
ADD COLUMN IF NOT EXISTS ch_company_profile JSONB,
ADD COLUMN IF NOT EXISTS ch_last_synced_at TIMESTAMPTZ;

-- =====================================================
-- 10. TRIGGERS FOR SHAREHOLDING INTEGRITY
-- =====================================================

-- Function to update shareholder balance after allotment
CREATE OR REPLACE FUNCTION public.update_shareholder_on_allotment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update shareholder shares_held
  UPDATE company_shareholders
  SET 
    shares_held = shares_held + NEW.shares_allotted,
    as_at_date = NEW.allotment_date,
    updated_at = now()
  WHERE id = NEW.shareholder_id;
  
  -- Update share class total
  UPDATE company_share_classes
  SET 
    total_shares_issued = total_shares_issued + NEW.shares_allotted,
    updated_at = now()
  WHERE id = NEW.share_class_id;
  
  -- Create register event
  INSERT INTO company_register_events (
    company_id, event_type, event_date, source, details,
    shareholder_id, allotment_id, created_by
  )
  VALUES (
    NEW.company_id, 'allotment', NEW.allotment_date, 'workpaper',
    jsonb_build_object(
      'shares_allotted', NEW.shares_allotted,
      'price_per_share', NEW.price_per_share,
      'total_consideration', NEW.total_consideration
    ),
    NEW.shareholder_id, NEW.id, auth.uid()
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_shareholder_on_allotment
AFTER INSERT ON public.company_share_allotments
FOR EACH ROW
EXECUTE FUNCTION public.update_shareholder_on_allotment();

-- Function to update shareholder balances after transfer
CREATE OR REPLACE FUNCTION public.update_shareholders_on_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Decrease from_shareholder
  UPDATE company_shareholders
  SET 
    shares_held = shares_held - NEW.shares_transferred,
    as_at_date = NEW.transfer_date,
    updated_at = now()
  WHERE id = NEW.from_shareholder_id;
  
  -- Increase to_shareholder
  UPDATE company_shareholders
  SET 
    shares_held = shares_held + NEW.shares_transferred,
    as_at_date = NEW.transfer_date,
    updated_at = now()
  WHERE id = NEW.to_shareholder_id;
  
  -- Create register event
  INSERT INTO company_register_events (
    company_id, event_type, event_date, source, details,
    transfer_id, created_by
  )
  VALUES (
    NEW.company_id, 'transfer', NEW.transfer_date, 'workpaper',
    jsonb_build_object(
      'shares_transferred', NEW.shares_transferred,
      'from_shareholder_id', NEW.from_shareholder_id,
      'to_shareholder_id', NEW.to_shareholder_id,
      'consideration', NEW.consideration
    ),
    NEW.id, auth.uid()
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_shareholders_on_transfer
AFTER INSERT ON public.company_share_transfers
FOR EACH ROW
EXECUTE FUNCTION public.update_shareholders_on_transfer();

-- Function to create event on officer change
CREATE OR REPLACE FUNCTION public.create_officer_register_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT c.id INTO v_company_id FROM companies c 
  JOIN company_officers co ON co.company_id = c.id 
  WHERE co.id = COALESCE(NEW.id, OLD.id);
  
  IF TG_OP = 'INSERT' THEN
    INSERT INTO company_register_events (
      company_id, event_type, event_date, source, details,
      person_id, officer_id, created_by
    )
    VALUES (
      NEW.company_id, 'appointment', NEW.appointed_at, 'workpaper',
      jsonb_build_object('role', NEW.role),
      NEW.person_id, NEW.id, auth.uid()
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.resigned_at IS NOT NULL AND OLD.resigned_at IS NULL THEN
    INSERT INTO company_register_events (
      company_id, event_type, event_date, source, details,
      person_id, officer_id, created_by
    )
    VALUES (
      NEW.company_id, 
      CASE WHEN NEW.role = 'director' THEN 'resignation' ELSE 'termination' END,
      NEW.resigned_at, 'workpaper',
      jsonb_build_object('role', NEW.role),
      NEW.person_id, NEW.id, auth.uid()
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trigger_create_officer_register_event
AFTER INSERT OR UPDATE ON public.company_officers
FOR EACH ROW
EXECUTE FUNCTION public.create_officer_register_event();

-- Function to create event on PSC change
CREATE OR REPLACE FUNCTION public.create_psc_register_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO company_register_events (
      company_id, event_type, event_date, source, details,
      person_id, psc_id, created_by
    )
    VALUES (
      NEW.company_id, 'psc_added', NEW.notified_at, 'workpaper',
      jsonb_build_object('nature_of_control', NEW.nature_of_control),
      NEW.person_id, NEW.id, auth.uid()
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.ceased_at IS NOT NULL AND OLD.ceased_at IS NULL THEN
    INSERT INTO company_register_events (
      company_id, event_type, event_date, source, details,
      person_id, psc_id, created_by
    )
    VALUES (
      NEW.company_id, 'psc_ceased', NEW.ceased_at, 'workpaper',
      jsonb_build_object('nature_of_control', NEW.nature_of_control),
      NEW.person_id, NEW.id, auth.uid()
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.nature_of_control IS DISTINCT FROM OLD.nature_of_control THEN
    INSERT INTO company_register_events (
      company_id, event_type, event_date, source, details,
      person_id, psc_id, created_by
    )
    VALUES (
      NEW.company_id, 'psc_updated', CURRENT_DATE, 'workpaper',
      jsonb_build_object(
        'old_nature_of_control', OLD.nature_of_control,
        'new_nature_of_control', NEW.nature_of_control
      ),
      NEW.person_id, NEW.id, auth.uid()
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trigger_create_psc_register_event
AFTER INSERT OR UPDATE ON public.company_pscs
FOR EACH ROW
EXECUTE FUNCTION public.create_psc_register_event();

-- =====================================================
-- 11. RLS POLICIES
-- =====================================================

-- Company Persons
ALTER TABLE public.company_persons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view company persons in their organization"
ON public.company_persons FOR SELECT
TO authenticated
USING (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can insert company persons in their organization"
ON public.company_persons FOR INSERT
TO authenticated
WITH CHECK (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can update company persons in their organization"
ON public.company_persons FOR UPDATE
TO authenticated
USING (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can delete company persons in their organization"
ON public.company_persons FOR DELETE
TO authenticated
USING (public.user_has_organization_access(organization_id));

-- Company Officers
ALTER TABLE public.company_officers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view officers for companies in their organization"
ON public.company_officers FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can insert officers for companies in their organization"
ON public.company_officers FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can update officers for companies in their organization"
ON public.company_officers FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can delete officers for companies in their organization"
ON public.company_officers FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

-- Company PSCs
ALTER TABLE public.company_pscs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view PSCs for companies in their organization"
ON public.company_pscs FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can insert PSCs for companies in their organization"
ON public.company_pscs FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can update PSCs for companies in their organization"
ON public.company_pscs FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can delete PSCs for companies in their organization"
ON public.company_pscs FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

-- Company Share Classes
ALTER TABLE public.company_share_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view share classes for companies in their organization"
ON public.company_share_classes FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can insert share classes for companies in their organization"
ON public.company_share_classes FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can update share classes for companies in their organization"
ON public.company_share_classes FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can delete share classes for companies in their organization"
ON public.company_share_classes FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

-- Company Shareholders
ALTER TABLE public.company_shareholders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shareholders for companies in their organization"
ON public.company_shareholders FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can insert shareholders for companies in their organization"
ON public.company_shareholders FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can update shareholders for companies in their organization"
ON public.company_shareholders FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can delete shareholders for companies in their organization"
ON public.company_shareholders FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

-- Company Share Allotments
ALTER TABLE public.company_share_allotments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view allotments for companies in their organization"
ON public.company_share_allotments FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can insert allotments for companies in their organization"
ON public.company_share_allotments FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

-- Company Share Transfers
ALTER TABLE public.company_share_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view transfers for companies in their organization"
ON public.company_share_transfers FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can insert transfers for companies in their organization"
ON public.company_share_transfers FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

-- Company Register Events
ALTER TABLE public.company_register_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view register events for companies in their organization"
ON public.company_register_events FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

CREATE POLICY "Users can insert register events for companies in their organization"
ON public.company_register_events FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = company_id 
  AND public.user_has_organization_access(c.organization_id)
));

-- =====================================================
-- 12. INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX idx_company_persons_organization ON public.company_persons(organization_id);
CREATE INDEX idx_company_persons_linked_client ON public.company_persons(linked_client_id) WHERE linked_client_id IS NOT NULL;
CREATE INDEX idx_company_officers_company ON public.company_officers(company_id);
CREATE INDEX idx_company_officers_person ON public.company_officers(person_id);
CREATE INDEX idx_company_officers_active ON public.company_officers(company_id) WHERE resigned_at IS NULL;
CREATE INDEX idx_company_pscs_company ON public.company_pscs(company_id);
CREATE INDEX idx_company_pscs_person ON public.company_pscs(person_id);
CREATE INDEX idx_company_pscs_active ON public.company_pscs(company_id) WHERE ceased_at IS NULL;
CREATE INDEX idx_company_share_classes_company ON public.company_share_classes(company_id);
CREATE INDEX idx_company_shareholders_company ON public.company_shareholders(company_id);
CREATE INDEX idx_company_shareholders_person ON public.company_shareholders(person_id);
CREATE INDEX idx_company_share_allotments_company ON public.company_share_allotments(company_id);
CREATE INDEX idx_company_share_allotments_shareholder ON public.company_share_allotments(shareholder_id);
CREATE INDEX idx_company_share_transfers_company ON public.company_share_transfers(company_id);
CREATE INDEX idx_company_register_events_company ON public.company_register_events(company_id);
CREATE INDEX idx_company_register_events_type ON public.company_register_events(event_type);
CREATE INDEX idx_company_register_events_date ON public.company_register_events(event_date DESC);
CREATE INDEX idx_companies_ch_sync ON public.companies(ch_last_synced_at) WHERE ch_company_profile IS NOT NULL;
