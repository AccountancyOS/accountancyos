-- Phase 2: Schema & RLS Consolidation

-- 2.1 Add missing columns to bank_connections
ALTER TABLE bank_connections 
ADD COLUMN IF NOT EXISTS scope text NULL,
ADD COLUMN IF NOT EXISTS last_error text NULL,
ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NULL;

-- 2.2 Add missing columns to bank_accounts
ALTER TABLE bank_accounts 
ADD COLUMN IF NOT EXISTS account_number text NULL,
ADD COLUMN IF NOT EXISTS sort_code text NULL;

-- 2.3 Add missing columns to bank_transactions
ALTER TABLE bank_transactions 
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'GBP',
ADD COLUMN IF NOT EXISTS category text NULL,
ADD COLUMN IF NOT EXISTS raw_json jsonb NULL,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2.4 Add RLS policies to bank_connections (tokens must never leak to portal)
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_users_can_manage_bank_connections" ON bank_connections;
CREATE POLICY "org_users_can_manage_bank_connections"
  ON bank_connections FOR ALL
  USING (user_has_organization_access(organization_id))
  WITH CHECK (user_has_organization_access(organization_id));

-- 2.5 Add RLS policies to truelayer_auth_states (service role only, but allow users to view their own pending states)
ALTER TABLE truelayer_auth_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_can_view_own_auth_states" ON truelayer_auth_states;
CREATE POLICY "users_can_view_own_auth_states"
  ON truelayer_auth_states FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
  ));

-- Phase 5: Portal-Facing DX - Create RPC for portal bank accounts with connection status
CREATE OR REPLACE FUNCTION get_portal_bank_accounts_for_entity(
  _user_id uuid,
  _client_id uuid DEFAULT NULL,
  _company_id uuid DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  name text,
  account_number text,
  sort_code text,
  currency text,
  provider text,
  last_synced_at timestamptz,
  connection_status text
) 
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
BEGIN
  -- Verify user has access to this entity
  IF NOT client_has_portal_access(_user_id, _client_id, _company_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Get organization_id
  IF _client_id IS NOT NULL THEN
    SELECT organization_id INTO _org_id FROM clients WHERE id = _client_id;
  ELSIF _company_id IS NOT NULL THEN
    SELECT organization_id INTO _org_id FROM companies WHERE id = _company_id;
  END IF;

  -- Return bank accounts with connection status
  RETURN QUERY
  SELECT 
    ba.id,
    ba.name,
    ba.account_number,
    ba.sort_code,
    ba.currency,
    ba.provider,
    COALESCE(bc.last_synced_at, ba.last_synced_at) as last_synced_at,
    COALESCE(bc.status, 'active') as connection_status
  FROM bank_accounts ba
  LEFT JOIN bank_connections bc ON (
    bc.organization_id = ba.organization_id
    AND bc.provider = ba.provider
    AND (
      (bc.client_id IS NOT NULL AND bc.client_id = ba.client_id) OR
      (bc.company_id IS NOT NULL AND bc.company_id = ba.company_id)
    )
  )
  WHERE ba.organization_id = _org_id
    AND (
      (_client_id IS NOT NULL AND ba.client_id = _client_id) OR
      (_company_id IS NOT NULL AND ba.company_id = _company_id)
    )
    AND ba.is_active = true
  ORDER BY ba.name;
END;
$$;