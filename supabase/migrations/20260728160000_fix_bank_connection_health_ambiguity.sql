-- =====================================================================================
-- DEF-006: get_bank_connection_health_for_org fails with 42702 on every /bookkeeping load.
-- =====================================================================================
-- The function declares an OUT parameter named `organization_id` (part of its RETURNS
-- TABLE list). Inside the authorisation check, `organization_id` is written unqualified:
--
--     SELECT 1 FROM public.organization_users
--      WHERE user_id = auth.uid() AND organization_id = _org_id
--
-- PostgreSQL cannot tell whether that names the OUT parameter or organization_users'
-- column, and raises `42702 column reference "organization_id" is ambiguous`. The RPC
-- therefore aborts before returning a single row, on every call.
--
-- The user never learns. /bookkeeping fires this three times per load, ignores the
-- failure, and renders as though every bank connection were healthy — a Gate 6 silent
-- failure of exactly the kind the audit identified as this product's largest risk. An
-- expired consent or a broken feed looks identical to a working one.
--
-- Fixed by ALIASING the table and qualifying both references (`ou.user_id`,
-- `ou.organization_id`) rather than by setting `#variable_conflict use_column`. The
-- pragma would silently change how EVERY unqualified name in the body resolves; the alias
-- changes exactly the two references that are wrong and leaves the rest provably alone.
--
-- Basis: the LIVE body, def-hash 7012eeed15ee414c3bec6df9d574ad9d, fetched via MCP
-- catalog_functions(include_source: true) on 2026-07-28 and reproduced verbatim except
-- those two qualifications. Signature, STABLE, SECURITY DEFINER, search_path and the
-- returned column list are unchanged, so no caller or grant is affected.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_bank_connection_health_for_org(_org_id uuid)
 RETURNS TABLE(connection_id uuid, organization_id uuid, client_id uuid, company_id uuid, provider text, bank_name text, bank_logo_url text, status text, derived_status text, consent_expires_at timestamp with time zone, last_synced_at timestamp with time zone, last_error text, account_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- CHANGED: aliased + fully qualified. `organization_id` alone collided with the OUT
  -- parameter of the same name and made the whole function unusable.
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
