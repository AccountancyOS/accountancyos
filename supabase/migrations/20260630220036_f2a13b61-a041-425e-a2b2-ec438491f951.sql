ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS bank_transactions_set_updated_at ON public.bank_transactions;
CREATE TRIGGER bank_transactions_set_updated_at
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bookkeeping_accounts
  ADD COLUMN IF NOT EXISTS truelayer_account_id text;

CREATE INDEX IF NOT EXISTS idx_bookkeeping_accounts_truelayer
  ON public.bookkeeping_accounts (organization_id, truelayer_account_id)
  WHERE truelayer_account_id IS NOT NULL;

DROP POLICY IF EXISTS "org_admins_insert_bank_connections" ON public.bank_connections;