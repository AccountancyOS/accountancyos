
-- CGT Disposals — detailed per-disposal records linked to filings
CREATE TABLE public.cgt_disposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID REFERENCES public.clients(id),
  filing_id UUID REFERENCES public.filings(id),
  asset_description TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'other' CHECK (asset_type IN ('property', 'shares', 'crypto', 'other')),
  acquisition_date DATE,
  disposal_date DATE NOT NULL,
  disposal_proceeds NUMERIC(15,2) NOT NULL DEFAULT 0,
  allowable_costs NUMERIC(15,2) NOT NULL DEFAULT 0,
  gain_or_loss NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_residential_property BOOLEAN NOT NULL DEFAULT false,
  token_symbol TEXT,
  crypto_pool_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.cgt_disposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org cgt_disposals" ON public.cgt_disposals
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can insert org cgt_disposals" ON public.cgt_disposals
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can update org cgt_disposals" ON public.cgt_disposals
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can delete org cgt_disposals" ON public.cgt_disposals
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );

-- Crypto Token Pools — Section 104 pool per token per client
CREATE TABLE public.crypto_token_pools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID NOT NULL REFERENCES public.clients(id),
  token_symbol TEXT NOT NULL,
  token_name TEXT,
  total_quantity NUMERIC(20,8) NOT NULL DEFAULT 0,
  total_cost_gbp NUMERIC(15,2) NOT NULL DEFAULT 0,
  average_cost_per_unit NUMERIC(15,8) NOT NULL DEFAULT 0,
  tax_year TEXT,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, client_id, token_symbol, tax_year)
);

ALTER TABLE public.crypto_token_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org crypto_token_pools" ON public.crypto_token_pools
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can insert org crypto_token_pools" ON public.crypto_token_pools
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can update org crypto_token_pools" ON public.crypto_token_pools
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can delete org crypto_token_pools" ON public.crypto_token_pools
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );

-- Crypto Transactions — raw transaction ledger for pool computation
CREATE TABLE public.crypto_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID NOT NULL REFERENCES public.clients(id),
  tx_date DATE NOT NULL,
  tx_type TEXT NOT NULL CHECK (tx_type IN ('buy', 'sell', 'swap_in', 'swap_out', 'transfer_in', 'transfer_out', 'airdrop', 'fork', 'mining', 'staking_reward', 'gift_received', 'gift_given', 'lost', 'fee')),
  token_symbol TEXT NOT NULL,
  quantity NUMERIC(20,8) NOT NULL DEFAULT 0,
  cost_gbp NUMERIC(15,2) NOT NULL DEFAULT 0,
  proceeds_gbp NUMERIC(15,2) NOT NULL DEFAULT 0,
  fee_gbp NUMERIC(15,2) NOT NULL DEFAULT 0,
  classification TEXT CHECK (classification IN ('income', 'capital', 'non_taxable', 'unclassified')),
  counterpart_token TEXT,
  exchange_name TEXT,
  tx_hash TEXT,
  notes TEXT,
  import_batch_id TEXT,
  filing_id UUID REFERENCES public.filings(id),
  disposal_id UUID REFERENCES public.cgt_disposals(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.crypto_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org crypto_transactions" ON public.crypto_transactions
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can insert org crypto_transactions" ON public.crypto_transactions
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can update org crypto_transactions" ON public.crypto_transactions
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can delete org crypto_transactions" ON public.crypto_transactions
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );

-- Add FK from cgt_disposals to crypto_token_pools
ALTER TABLE public.cgt_disposals ADD CONSTRAINT cgt_disposals_crypto_pool_id_fkey
  FOREIGN KEY (crypto_pool_id) REFERENCES public.crypto_token_pools(id);

-- Indexes
CREATE INDEX idx_cgt_disposals_filing ON public.cgt_disposals(filing_id);
CREATE INDEX idx_cgt_disposals_client ON public.cgt_disposals(client_id);
CREATE INDEX idx_crypto_transactions_client_token ON public.crypto_transactions(client_id, token_symbol, tx_date);
CREATE INDEX idx_crypto_token_pools_client ON public.crypto_token_pools(client_id, token_symbol);
