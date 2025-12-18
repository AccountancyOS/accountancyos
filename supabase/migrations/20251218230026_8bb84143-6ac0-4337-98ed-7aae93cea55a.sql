-- Create idempotency_keys table for preventing duplicate operations
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'succeeded', 'failed')),
  response_json JSONB,
  error_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, scope, key)
);

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_lookup 
ON public.idempotency_keys(organization_id, scope, key);

-- Create index for cleanup of old records
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created 
ON public.idempotency_keys(created_at);

-- Enable RLS
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Policy: org members can read their org's keys
CREATE POLICY "org_members_can_read_idempotency_keys"
ON public.idempotency_keys
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_users.user_id = auth.uid()
    AND organization_users.organization_id = idempotency_keys.organization_id
  )
);

-- Note: Inserts/updates are done via service role in edge functions

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_idempotency_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_idempotency_keys_updated_at
BEFORE UPDATE ON public.idempotency_keys
FOR EACH ROW
EXECUTE FUNCTION public.update_idempotency_keys_updated_at();