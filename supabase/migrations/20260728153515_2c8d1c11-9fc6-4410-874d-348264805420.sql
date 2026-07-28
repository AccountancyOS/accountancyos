CREATE OR REPLACE FUNCTION public.get_bank_connection_health_for_org(_org_id uuid)
 RETURNS TABLE(connection_id uuid, organization_id uuid, client_id uuid, company_id uuid, provider text, bank_name text, bank_logo_url text, status text, derived_status text, consent_expires_at timestamp with time zone, last_synced_at timestamp with time zone, last_error text, account_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid() AND ou.organization_id = _org_id
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.organization_id,
    c.client_id,
    c.company_id,
    c.provider,
    c.bank_name,
    c.bank_logo_url,
    c.status,
    public.derive_bank_connection_status(c.consent_expires_at, c.status, c.last_error, c.last_synced_at),
    c.consent_expires_at,
    c.last_synced_at,
    c.last_error,
    (SELECT count(*) FROM public.bank_accounts ba
       WHERE ba.organization_id = c.organization_id
         AND (
           (c.client_id IS NOT NULL AND ba.client_id = c.client_id)
           OR (c.company_id IS NOT NULL AND ba.company_id = c.company_id)
         ))
  FROM public.bank_connections c
  WHERE c.organization_id = _org_id;
END;
$function$;