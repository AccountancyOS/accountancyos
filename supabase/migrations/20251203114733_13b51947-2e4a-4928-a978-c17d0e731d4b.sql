-- Create outlook_auth_states table for OAuth CSRF protection
CREATE TABLE public.outlook_auth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  redirect_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '10 minutes') NOT NULL
);

-- Enable RLS
ALTER TABLE public.outlook_auth_states ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can manage their own outlook auth states"
  ON public.outlook_auth_states
  FOR ALL
  USING (user_id = auth.uid());

-- Index for quick state lookups
CREATE INDEX idx_outlook_auth_states_state ON public.outlook_auth_states(state);

-- Index for cleanup
CREATE INDEX idx_outlook_auth_states_expires_at ON public.outlook_auth_states(expires_at);

-- Cleanup function for expired states
CREATE OR REPLACE FUNCTION public.cleanup_expired_outlook_auth_states()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM outlook_auth_states WHERE expires_at < now();
END;
$$;