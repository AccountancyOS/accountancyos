-- Add Stripe Connect columns to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT,
ADD COLUMN IF NOT EXISTS payment_required_before_onboarding BOOLEAN NOT NULL DEFAULT false;