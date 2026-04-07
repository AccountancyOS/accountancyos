
-- Fix Security Definer View warnings by setting SECURITY INVOKER
ALTER VIEW public.bank_connections_safe SET (security_invoker = on);
ALTER VIEW public.organization_integrations_hmrc_safe SET (security_invoker = on);
