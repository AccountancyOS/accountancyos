-- Phase 2: Lifecycle Engine Schema Changes (Additive Only)

-- 1. Leads table - add lifecycle metadata
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS converted_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS lost_reason text NULL;

-- 2. Quotes table - add lifecycle metadata
ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS sent_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS rejected_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS rejection_reason text NULL;

-- 3. Onboarding Applications - add contract & AML tracking
ALTER TABLE onboarding_applications 
ADD COLUMN IF NOT EXISTS contracts_sent_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS contracts_signed_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS signature_data jsonb NULL,
ADD COLUMN IF NOT EXISTS documents_requested_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS aml_submitted_at timestamptz NULL;

-- 4. Clients table - add lifecycle status
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS activated_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS disengaged_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

-- Add CHECK constraint for allowed values
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_status_check'
  ) THEN
    ALTER TABLE clients 
    ADD CONSTRAINT clients_status_check 
    CHECK (status IN ('pending', 'active', 'disengaged', 'archived'));
  END IF;
END $$;

-- 5. Companies table - add lifecycle status
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS activated_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS disengaged_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

-- Add CHECK constraint for allowed values
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_status_check'
  ) THEN
    ALTER TABLE companies 
    ADD CONSTRAINT companies_status_check 
    CHECK (status IN ('pending', 'active', 'disengaged', 'archived'));
  END IF;
END $$;

-- 6. Engagements table - add status (keeping active boolean)
ALTER TABLE engagements 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS activated_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS suspended_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS terminated_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS termination_reason text NULL;

-- Add CHECK constraint for allowed values
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'engagements_status_check'
  ) THEN
    ALTER TABLE engagements 
    ADD CONSTRAINT engagements_status_check 
    CHECK (status IN ('draft', 'active', 'suspended', 'terminated'));
  END IF;
END $$;

-- 7. Portal Access table - add invitation workflow support
ALTER TABLE portal_access 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'invited',
ADD COLUMN IF NOT EXISTS invite_token text NULL,
ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS invited_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS accepted_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS revoked_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS revoked_reason text NULL;

-- Add CHECK constraint for allowed values
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'portal_access_status_check'
  ) THEN
    ALTER TABLE portal_access 
    ADD CONSTRAINT portal_access_status_check 
    CHECK (status IN ('invited', 'active', 'revoked'));
  END IF;
END $$;

-- Add unique constraint on invite_token
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'portal_access_invite_token_unique'
  ) THEN
    ALTER TABLE portal_access 
    ADD CONSTRAINT portal_access_invite_token_unique UNIQUE (invite_token);
  END IF;
END $$;

-- 8. Create audit_log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  field_name text NULL,
  old_value text NULL,
  new_value text NULL,
  user_id uuid NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Org users can view audit logs
DROP POLICY IF EXISTS "org_users_can_view_audit_log" ON public.audit_log;
CREATE POLICY "org_users_can_view_audit_log"
  ON public.audit_log FOR SELECT
  USING (user_has_organization_access(organization_id));

-- RLS Policy: Org users can insert audit logs
DROP POLICY IF EXISTS "org_users_can_insert_audit_log" ON public.audit_log;
CREATE POLICY "org_users_can_insert_audit_log"
  ON public.audit_log FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

-- 9. Create engagement_letters table
CREATE TABLE IF NOT EXISTS public.engagement_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  onboarding_application_id uuid NOT NULL REFERENCES public.onboarding_applications(id),
  template_id uuid NULL REFERENCES public.templates(id),
  document_content text NULL,
  sent_at timestamptz NULL,
  viewed_at timestamptz NULL,
  signed_at timestamptz NULL,
  signature_ip text NULL,
  signature_user_agent text NULL,
  signature_token text UNIQUE NULL,
  token_expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on engagement_letters
ALTER TABLE public.engagement_letters ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Org users can manage engagement letters
DROP POLICY IF EXISTS "org_users_can_manage_engagement_letters" ON public.engagement_letters;
CREATE POLICY "org_users_can_manage_engagement_letters"
  ON public.engagement_letters FOR ALL
  USING (user_has_organization_access(organization_id))
  WITH CHECK (user_has_organization_access(organization_id));

-- 10. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_log_org_entity 
  ON public.audit_log (organization_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_engagement_letters_onboarding 
  ON public.engagement_letters (onboarding_application_id);

CREATE INDEX IF NOT EXISTS idx_portal_access_status 
  ON public.portal_access (client_id, company_id, status);

CREATE INDEX IF NOT EXISTS idx_engagements_status 
  ON public.engagements (client_id, company_id, status);

CREATE INDEX IF NOT EXISTS idx_clients_status 
  ON public.clients (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_companies_status 
  ON public.companies (organization_id, status);