-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- MULTI-TENANCY & IDENTITY
-- ============================================

-- Organizations (accounting firms)
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  logo_url TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'UK',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Organization users (staff)
CREATE TABLE public.organization_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CRM TABLES
-- ============================================

-- Leads table
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  source TEXT CHECK (source IN ('website', 'referral', 'ad', 'direct', 'other')),
  pipeline_stage TEXT NOT NULL DEFAULT 'new' CHECK (pipeline_stage IN ('new', 'qualified', 'proposal_sent', 'chasing', 'won', 'lost')),
  estimated_monthly_value NUMERIC(10, 2),
  tags JSONB DEFAULT '[]'::jsonb,
  assigned_to UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Lead activities
CREATE TABLE public.lead_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('note', 'call', 'email', 'sms', 'whatsapp', 'task', 'meeting')),
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  subject TEXT,
  body TEXT,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

-- Message templates
CREATE TABLE public.message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Organizations: Users can only see their own organization
CREATE POLICY "Users can view their organization"
  ON public.organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their organization"
  ON public.organizations FOR UPDATE
  USING (
    id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Organization users: Can view users in their organization
CREATE POLICY "Users can view organization members"
  ON public.organization_users FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

-- Leads: Can only access leads in their organization
CREATE POLICY "Users can view leads in their organization"
  ON public.leads FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert leads in their organization"
  ON public.leads FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update leads in their organization"
  ON public.leads FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete leads in their organization"
  ON public.leads FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

-- Lead activities
CREATE POLICY "Users can view activities in their organization"
  ON public.lead_activities FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert activities in their organization"
  ON public.lead_activities FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update activities in their organization"
  ON public.lead_activities FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete activities in their organization"
  ON public.lead_activities FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

-- Message templates
CREATE POLICY "Users can view templates in their organization"
  ON public.message_templates FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert templates in their organization"
  ON public.message_templates FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update templates in their organization"
  ON public.message_templates FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete templates in their organization"
  ON public.message_templates FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get current user's organization
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id 
  FROM public.organization_users 
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Function to check if user has role
CREATE OR REPLACE FUNCTION public.has_organization_role(required_role TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.organization_users 
    WHERE user_id = auth.uid() 
    AND role = required_role
  );
$$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();