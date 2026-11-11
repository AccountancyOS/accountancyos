-- =====================================================
-- P0: Lock down organizations table + split billing data
-- =====================================================

-- 1) Revoke anon/public privileges (defence in depth)
REVOKE ALL ON TABLE public.organizations FROM anon;
REVOKE ALL ON TABLE public.organizations FROM public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations TO authenticated;

-- 2) Drop the problematic {public} INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;

-- 3) Create org_admins_insert policy (controlled org creation)
CREATE POLICY "org_admins_insert_organization"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- 4) Create organization_billing table for sensitive billing data
CREATE TABLE IF NOT EXISTS public.organization_billing (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_connect_account_id text,
  billing_status text DEFAULT 'trialing',
  pending_checkout_session_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on billing table
ALTER TABLE public.organization_billing ENABLE ROW LEVEL SECURITY;

-- Revoke anon/public from billing table
REVOKE ALL ON TABLE public.organization_billing FROM anon;
REVOKE ALL ON TABLE public.organization_billing FROM public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_billing TO authenticated;

-- Only owner/admin can SELECT billing data
CREATE POLICY "org_admins_select_billing"
ON public.organization_billing
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = organization_billing.organization_id
      AND ou.role IN ('owner', 'admin')
  )
);

-- Only owner/admin can UPDATE billing data
CREATE POLICY "org_admins_update_billing"
ON public.organization_billing
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = organization_billing.organization_id
      AND ou.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = organization_billing.organization_id
      AND ou.role IN ('owner', 'admin')
  )
);

-- Only owner/admin can INSERT billing data
CREATE POLICY "org_admins_insert_billing"
ON public.organization_billing
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = organization_billing.organization_id
      AND ou.role IN ('owner', 'admin')
  )
);

-- 5) Backfill existing billing data from organizations table
INSERT INTO public.organization_billing (
  organization_id,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_connect_account_id,
  billing_status,
  pending_checkout_session_id
)
SELECT
  id,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_connect_account_id,
  billing_status::text,
  pending_checkout_session_id
FROM public.organizations
WHERE stripe_customer_id IS NOT NULL 
   OR stripe_subscription_id IS NOT NULL
   OR billing_status IS NOT NULL
ON CONFLICT (organization_id) DO NOTHING;

-- 6) Create index for RLS performance
CREATE INDEX IF NOT EXISTS idx_organization_billing_org ON public.organization_billing(organization_id);

-- 7) Add trigger for updated_at
CREATE TRIGGER update_organization_billing_updated_at
  BEFORE UPDATE ON public.organization_billing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();