-- Create enum for link status
CREATE TYPE public.accountant_client_link_status AS ENUM (
  'pending_client_approval',
  'pending_practice_approval', 
  'active',
  'declined',
  'revoked_by_client',
  'revoked_by_practice',
  'switched_out'
);

-- Create enum for link initiator
CREATE TYPE public.link_initiator AS ENUM ('client', 'practice');

-- Create accountant_client_links table
CREATE TABLE public.accountant_client_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  client_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status accountant_client_link_status NOT NULL DEFAULT 'pending_practice_approval',
  initiated_by link_initiator NOT NULL DEFAULT 'practice',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  activated_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  decline_reason TEXT,
  notes TEXT,
  CONSTRAINT check_client_or_company CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR 
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- Create pending_practice_signups for invite-by-email flow
CREATE TABLE public.pending_practice_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_email TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  proposed_practice_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT check_client_or_company_pending CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR 
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- Add firm_code to organizations for easy linking
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS firm_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS is_public_listed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS practice_description TEXT;

-- Generate firm codes for existing organizations
UPDATE public.organizations 
SET firm_code = UPPER(SUBSTRING(MD5(id::text) FROM 1 FOR 6))
WHERE firm_code IS NULL;

-- Enable RLS
ALTER TABLE public.accountant_client_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_practice_signups ENABLE ROW LEVEL SECURITY;

-- RLS for accountant_client_links
-- Practice users can see links for their practice
CREATE POLICY "Practice users can view their links"
ON public.accountant_client_links
FOR SELECT
USING (user_has_organization_access(practice_id));

-- Practice users can manage links for their practice
CREATE POLICY "Practice users can insert links"
ON public.accountant_client_links
FOR INSERT
WITH CHECK (user_has_organization_access(practice_id));

CREATE POLICY "Practice users can update their links"
ON public.accountant_client_links
FOR UPDATE
USING (user_has_organization_access(practice_id));

-- Client portal users can see links involving them
CREATE POLICY "Client users can view their links"
ON public.accountant_client_links
FOR SELECT
USING (client_user_id = auth.uid());

-- Client users can update links (for approval/decline)
CREATE POLICY "Client users can update their links"
ON public.accountant_client_links
FOR UPDATE
USING (client_user_id = auth.uid());

-- RLS for pending_practice_signups
CREATE POLICY "Anyone can view pending signups by email"
ON public.pending_practice_signups
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert pending signups"
ON public.pending_practice_signups
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Create indexes
CREATE INDEX idx_accountant_client_links_practice ON public.accountant_client_links(practice_id);
CREATE INDEX idx_accountant_client_links_client ON public.accountant_client_links(client_id);
CREATE INDEX idx_accountant_client_links_company ON public.accountant_client_links(company_id);
CREATE INDEX idx_accountant_client_links_status ON public.accountant_client_links(status);
CREATE INDEX idx_accountant_client_links_client_user ON public.accountant_client_links(client_user_id);
CREATE INDEX idx_organizations_firm_code ON public.organizations(firm_code);

-- Trigger for updated_at
CREATE TRIGGER update_accountant_client_links_updated_at
BEFORE UPDATE ON public.accountant_client_links
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();