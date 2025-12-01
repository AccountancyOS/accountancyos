ALTER TABLE bank_accounts
ADD COLUMN provider TEXT DEFAULT 'MANUAL',
ADD COLUMN truelayer_account_id TEXT,
ADD COLUMN last_synced_at TIMESTAMPTZ;

ALTER TABLE bank_transactions
ADD COLUMN truelayer_transaction_id TEXT,
ADD COLUMN provider TEXT DEFAULT 'CSV';

CREATE TABLE public.bank_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id UUID REFERENCES clients(id),
  company_id UUID REFERENCES companies(id),
  provider TEXT NOT NULL DEFAULT 'TRUELAYER',
  provider_connection_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  access_token TEXT,
  refresh_token TEXT,
  consent_expires_at TIMESTAMPTZ,
  bank_name TEXT,
  bank_logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT bank_connections_entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

CREATE INDEX idx_bank_connections_org ON bank_connections(organization_id);

ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.truelayer_auth_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,
  organization_id UUID NOT NULL,
  client_id UUID,
  company_id UUID,
  redirect_path TEXT DEFAULT '/bookkeeping',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '10 minutes')
);

CREATE INDEX idx_truelayer_auth_states_state ON truelayer_auth_states(state);

ALTER TABLE truelayer_auth_states ENABLE ROW LEVEL SECURITY