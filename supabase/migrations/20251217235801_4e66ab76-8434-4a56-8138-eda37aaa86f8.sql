-- Task 4a: Create subscription cache table
CREATE TABLE IF NOT EXISTS public.organization_subscription_cache (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscribed BOOLEAN NOT NULL DEFAULT false,
  subscription_id TEXT,
  subscription_status TEXT,
  subscription_end TIMESTAMPTZ,
  plan_name TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.organization_subscription_cache ENABLE ROW LEVEL SECURITY;

-- Users can view their own org's subscription status
CREATE POLICY "Users can view their organization subscription"
ON public.organization_subscription_cache FOR SELECT
USING (public.user_has_organization_access(organization_id));

-- Trigger for updated_at
CREATE TRIGGER update_subscription_cache_updated_at
  BEFORE UPDATE ON public.organization_subscription_cache
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Index for staleness checks
CREATE INDEX idx_subscription_cache_checked 
ON public.organization_subscription_cache(checked_at);

-- Enable realtime for instant UI updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_subscription_cache;

-- Add comment
COMMENT ON TABLE public.organization_subscription_cache IS 
'Caches subscription status from Stripe webhooks to reduce API polling. Updated by webhooks and check-subscription fallback.';