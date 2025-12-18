-- Extend existing api_rate_limits table with additional columns for edge function rate limiting
-- The table already exists, so we add missing columns if needed

-- Add user_id column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'api_rate_limits' 
    AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.api_rate_limits ADD COLUMN user_id UUID;
  END IF;
END $$;

-- Add organization_id column if not exists  
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'api_rate_limits' 
    AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.api_rate_limits ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
  END IF;
END $$;

-- Add scope column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'api_rate_limits' 
    AND column_name = 'scope'
  ) THEN
    ALTER TABLE public.api_rate_limits ADD COLUMN scope TEXT;
  END IF;
END $$;

-- Create index for rate limit lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup 
ON public.api_rate_limits(organization_id, user_id, scope, window_start);

-- Create index for cleanup
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup 
ON public.api_rate_limits(window_start);