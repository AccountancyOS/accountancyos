-- Remove anon SELECT policy exposing quote acceptance tokens
DROP POLICY IF EXISTS "Anyone can view active tokens" ON public.quote_acceptance_tokens;
DROP POLICY IF EXISTS "Anon can view active tokens" ON public.quote_acceptance_tokens;
DROP POLICY IF EXISTS "Public can view tokens" ON public.quote_acceptance_tokens;
DROP POLICY IF EXISTS "Public read active tokens" ON public.quote_acceptance_tokens;
REVOKE SELECT ON public.quote_acceptance_tokens FROM anon;