
-- 1. Token column lockdown
REVOKE SELECT (access_token, refresh_token) ON public.bank_connections FROM anon;
REVOKE SELECT (access_token, refresh_token) ON public.bank_connections FROM authenticated;
GRANT ALL ON public.bank_connections TO service_role;

-- 2. truelayer_auth_states reconnect schema
ALTER TABLE public.truelayer_auth_states
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'connect',
  ADD COLUMN IF NOT EXISTS bank_connection_id UUID,
  ADD COLUMN IF NOT EXISTS portal_user_id UUID,
  ADD COLUMN IF NOT EXISTS accountant_user_id UUID,
  ADD COLUMN IF NOT EXISTS return_url TEXT,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

ALTER TABLE public.truelayer_auth_states
  DROP CONSTRAINT IF EXISTS truelayer_auth_states_mode_check;
ALTER TABLE public.truelayer_auth_states
  ADD CONSTRAINT truelayer_auth_states_mode_check
  CHECK (mode IN ('connect','reconnect'));

ALTER TABLE public.truelayer_auth_states
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '10 minutes');

-- 3. bank_accounts: add bank_connection_id BEFORE indexes that need it
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS bank_connection_id UUID;
CREATE INDEX IF NOT EXISTS bank_accounts_connection_idx
  ON public.bank_accounts (bank_connection_id);

-- 4. bank_sync_logs
CREATE TABLE IF NOT EXISTS public.bank_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  bank_connection_id UUID NOT NULL,
  client_id UUID,
  company_id UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','success','partial','failed')),
  records_imported INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  client_safe_message TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('manual','scheduled','reconnect','callback')),
  triggered_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_sync_logs_connection_idx
  ON public.bank_sync_logs (bank_connection_id, started_at DESC);
CREATE INDEX IF NOT EXISTS bank_sync_logs_org_idx
  ON public.bank_sync_logs (organization_id, started_at DESC);
GRANT SELECT ON public.bank_sync_logs TO authenticated;
GRANT ALL ON public.bank_sync_logs TO service_role;
ALTER TABLE public.bank_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read bank sync logs" ON public.bank_sync_logs;
CREATE POLICY "Org members can read bank sync logs"
  ON public.bank_sync_logs FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Portal users can read scoped bank sync logs" ON public.bank_sync_logs;
CREATE POLICY "Portal users can read scoped bank sync logs"
  ON public.bank_sync_logs FOR SELECT
  TO authenticated
  USING (public.portal_can_access_bookkeeping(client_id, company_id));

-- 5. Portal permission granularity
ALTER TABLE public.portal_visibility_settings
  ADD COLUMN IF NOT EXISTS show_bank_transactions BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_bank_manual_sync BOOLEAN NOT NULL DEFAULT false;
UPDATE public.portal_visibility_settings
   SET show_bank_transactions = true
 WHERE show_bank_accounts = true AND show_bank_transactions = false;

-- 6. Unique constraints (partial — only when provider IDs are present)
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_provider_account_uidx
  ON public.bank_accounts (bank_connection_id, truelayer_account_id)
  WHERE truelayer_account_id IS NOT NULL AND bank_connection_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_provider_txn_uidx
  ON public.bank_transactions (bank_account_id, truelayer_transaction_id)
  WHERE truelayer_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bank_connections_provider_conn_uidx
  ON public.bank_connections (
    organization_id,
    coalesce(client_id::text, company_id::text),
    provider,
    provider_connection_id
  )
  WHERE provider_connection_id IS NOT NULL;

-- 7. Status derivation helper
CREATE OR REPLACE FUNCTION public.derive_bank_connection_status(
  _consent_expires_at TIMESTAMPTZ,
  _status TEXT,
  _last_error TEXT,
  _last_synced_at TIMESTAMPTZ
) RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _status IS NULL OR _status IN ('disconnected','revoked') THEN 'disconnected'
    WHEN _consent_expires_at IS NOT NULL AND _consent_expires_at < now() THEN 'expired'
    WHEN _last_error IS NOT NULL AND _last_error <> '' THEN 'sync_failed'
    WHEN _consent_expires_at IS NOT NULL
         AND _consent_expires_at < (now() + interval '7 days') THEN 'expiring_soon'
    WHEN _status IN ('ACTIVE','active') THEN 'connected'
    ELSE 'action_required'
  END;
$$;

-- 8. Accountant health RPC (org-wide)
CREATE OR REPLACE FUNCTION public.get_bank_connection_health_for_org(_org_id UUID)
RETURNS TABLE (
  connection_id UUID,
  organization_id UUID,
  client_id UUID,
  company_id UUID,
  provider TEXT,
  bank_name TEXT,
  bank_logo_url TEXT,
  status TEXT,
  derived_status TEXT,
  consent_expires_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  account_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE user_id = auth.uid() AND organization_id = _org_id
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
$$;

REVOKE ALL ON FUNCTION public.get_bank_connection_health_for_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_bank_connection_health_for_org(UUID) TO authenticated;

-- 9. Portal health RPC (entity-scoped, stripped projection)
CREATE OR REPLACE FUNCTION public.get_bank_connection_health_for_entity(
  _client_id UUID,
  _company_id UUID
)
RETURNS TABLE (
  connection_id UUID,
  bank_name TEXT,
  bank_logo_url TEXT,
  derived_status TEXT,
  consent_expires_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  client_safe_message TEXT,
  account_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.portal_can_access_bookkeeping(_client_id, _company_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.portal_has_perm(_client_id, _company_id, 'show_bank_accounts') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.bank_name,
    c.bank_logo_url,
    public.derive_bank_connection_status(c.consent_expires_at, c.status, c.last_error, c.last_synced_at),
    c.consent_expires_at,
    c.last_synced_at,
    CASE
      WHEN c.consent_expires_at IS NOT NULL AND c.consent_expires_at < now()
        THEN 'Bank connection expired. Reconnect bank.'
      WHEN c.consent_expires_at IS NOT NULL
        AND c.consent_expires_at < (now() + interval '7 days')
        THEN 'Your bank connection needs refreshing.'
      WHEN c.last_error IS NOT NULL AND c.last_error <> ''
        THEN 'Sync failed - contact your accountant.'
      ELSE NULL
    END,
    (SELECT count(*) FROM public.bank_accounts ba
       WHERE ba.organization_id = c.organization_id
         AND (
           (_client_id IS NOT NULL AND ba.client_id = _client_id)
           OR (_company_id IS NOT NULL AND ba.company_id = _company_id)
         ))
  FROM public.bank_connections c
  WHERE
    (_client_id IS NOT NULL AND c.client_id = _client_id)
    OR (_company_id IS NOT NULL AND c.company_id = _company_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_bank_connection_health_for_entity(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_bank_connection_health_for_entity(UUID, UUID) TO authenticated;
