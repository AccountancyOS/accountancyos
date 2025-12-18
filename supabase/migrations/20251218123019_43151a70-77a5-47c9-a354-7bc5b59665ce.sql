-- Create billing_status enum type
CREATE TYPE public.billing_status_enum AS ENUM ('pending_payment', 'active', 'past_due', 'canceled');

-- Add billing_status and pending_checkout_session_id to organizations
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS billing_status public.billing_status_enum NOT NULL DEFAULT 'pending_payment',
ADD COLUMN IF NOT EXISTS pending_checkout_session_id text NULL;

-- Create stripe_webhook_events table for idempotency
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  created_at timestamptz NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS with deny-all for client access (service role only)
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- No client access - only service role can write
CREATE POLICY "stripe_webhook_events_deny_all"
ON public.stripe_webhook_events FOR ALL USING (false);

-- Unique index for clients email per org (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS clients_org_email_uniq
ON public.clients (organization_id, lower(email))
WHERE email IS NOT NULL AND email <> '';

-- Unique index for companies email per org (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS companies_org_email_uniq
ON public.companies (organization_id, lower(email))
WHERE email IS NOT NULL AND email <> '';

-- Unique index for company_number per org (normalized)
CREATE UNIQUE INDEX IF NOT EXISTS companies_org_company_number_uniq
ON public.companies (organization_id, upper(replace(company_number, ' ', '')))
WHERE company_number IS NOT NULL AND company_number <> '';

-- Index for efficient billing status lookups
CREATE INDEX IF NOT EXISTS organizations_billing_status_idx ON public.organizations(billing_status);

-- Comment for documentation
COMMENT ON COLUMN public.organizations.billing_status IS 'Subscription billing state: pending_payment (needs to complete checkout), active (subscribed), past_due (payment failed), canceled (subscription ended)';