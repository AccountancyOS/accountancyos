-- Create clients table for individual clients
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  postcode text,
  country text DEFAULT 'UK',
  national_insurance_number text,
  utr text,
  date_of_birth date,
  notes text,
  tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create companies table
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  company_number text,
  vat_number text,
  email text NOT NULL,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  postcode text,
  country text DEFAULT 'UK',
  incorporation_date date,
  year_end_month integer,
  year_end_day integer,
  notes text,
  tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create services catalog
CREATE TABLE public.services_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  billing_model text NOT NULL CHECK (billing_model IN ('fixed', 'monthly', 'hourly')),
  default_price numeric(10, 2) NOT NULL,
  is_bookkeeping_related boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

-- Create quotes table
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quote_number text NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  total_amount numeric(10, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  valid_until date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE(organization_id, quote_number)
);

-- Create quote lines table
CREATE TABLE public.quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services_catalog(id) ON DELETE RESTRICT,
  description_override text,
  quantity numeric(10, 2) NOT NULL DEFAULT 1,
  unit_price numeric(10, 2) NOT NULL,
  subtotal numeric(10, 2) NOT NULL,
  line_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create engagements table (created when quote is accepted)
CREATE TABLE public.engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services_catalog(id) ON DELETE RESTRICT,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  frequency text NOT NULL CHECK (frequency IN ('annual', 'quarterly', 'monthly', 'one_off')),
  start_date date NOT NULL,
  end_date date,
  billing_notes text,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (client_id IS NOT NULL OR company_id IS NOT NULL)
);

-- Enable RLS on all tables
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;

-- RLS policies for clients
CREATE POLICY "Users can view clients in their organization"
ON public.clients FOR SELECT
TO authenticated
USING (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can insert clients in their organization"
ON public.clients FOR INSERT
TO authenticated
WITH CHECK (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can update clients in their organization"
ON public.clients FOR UPDATE
TO authenticated
USING (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can delete clients in their organization"
ON public.clients FOR DELETE
TO authenticated
USING (public.user_has_organization_access(organization_id));

-- RLS policies for companies
CREATE POLICY "Users can view companies in their organization"
ON public.companies FOR SELECT
TO authenticated
USING (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can insert companies in their organization"
ON public.companies FOR INSERT
TO authenticated
WITH CHECK (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can update companies in their organization"
ON public.companies FOR UPDATE
TO authenticated
USING (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can delete companies in their organization"
ON public.companies FOR DELETE
TO authenticated
USING (public.user_has_organization_access(organization_id));

-- RLS policies for services_catalog
CREATE POLICY "Users can view services in their organization"
ON public.services_catalog FOR SELECT
TO authenticated
USING (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can insert services in their organization"
ON public.services_catalog FOR INSERT
TO authenticated
WITH CHECK (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can update services in their organization"
ON public.services_catalog FOR UPDATE
TO authenticated
USING (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can delete services in their organization"
ON public.services_catalog FOR DELETE
TO authenticated
USING (public.user_has_organization_access(organization_id));

-- RLS policies for quotes
CREATE POLICY "Users can view quotes in their organization"
ON public.quotes FOR SELECT
TO authenticated
USING (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can insert quotes in their organization"
ON public.quotes FOR INSERT
TO authenticated
WITH CHECK (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can update quotes in their organization"
ON public.quotes FOR UPDATE
TO authenticated
USING (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can delete quotes in their organization"
ON public.quotes FOR DELETE
TO authenticated
USING (public.user_has_organization_access(organization_id));

-- RLS policies for quote_lines
CREATE POLICY "Users can view quote lines in their organization"
ON public.quote_lines FOR SELECT
TO authenticated
USING (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can insert quote lines in their organization"
ON public.quote_lines FOR INSERT
TO authenticated
WITH CHECK (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can update quote lines in their organization"
ON public.quote_lines FOR UPDATE
TO authenticated
USING (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can delete quote lines in their organization"
ON public.quote_lines FOR DELETE
TO authenticated
USING (public.user_has_organization_access(organization_id));

-- RLS policies for engagements
CREATE POLICY "Users can view engagements in their organization"
ON public.engagements FOR SELECT
TO authenticated
USING (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can insert engagements in their organization"
ON public.engagements FOR INSERT
TO authenticated
WITH CHECK (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can update engagements in their organization"
ON public.engagements FOR UPDATE
TO authenticated
USING (public.user_has_organization_access(organization_id));

CREATE POLICY "Users can delete engagements in their organization"
ON public.engagements FOR DELETE
TO authenticated
USING (public.user_has_organization_access(organization_id));

-- Create updated_at triggers
CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_services_catalog_updated_at
BEFORE UPDATE ON public.services_catalog
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_quotes_updated_at
BEFORE UPDATE ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_engagements_updated_at
BEFORE UPDATE ON public.engagements
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Create function to generate quote numbers
CREATE OR REPLACE FUNCTION public.generate_quote_number(org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quote_count integer;
  year_suffix text;
BEGIN
  year_suffix := TO_CHAR(NOW(), 'YY');
  
  SELECT COUNT(*) INTO quote_count
  FROM public.quotes
  WHERE organization_id = org_id
  AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  
  RETURN 'Q-' || year_suffix || '-' || LPAD((quote_count + 1)::text, 4, '0');
END;
$$;