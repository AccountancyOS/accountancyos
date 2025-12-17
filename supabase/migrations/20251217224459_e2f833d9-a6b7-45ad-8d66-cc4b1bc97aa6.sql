
-- Fix search_path warning for is_rpc_context
CREATE OR REPLACE FUNCTION public.is_rpc_context()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(current_setting('app.rpc', true), '') = '1';
$$;
