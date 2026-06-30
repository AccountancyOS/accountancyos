-- ============================================================
-- Bookkeeping module — repair bank sync/feed schema drift
-- ============================================================
-- The TrueLayer sync, bank-rule engine and ledger-posting RPC all write columns that
-- were never added to bank_transactions, so syncing/categorising/posting errored and the
-- transaction feed never populated. Add them. Also: dedup TrueLayer GL accounts on
-- reconnect, and stop accountants from initiating bank connections (TrueLayer is
-- client/portal-only).
-- ============================================================

-- 1. bank_transactions missing columns.
--    - currency:  written by truelayer-sync (txn.currency) + read by post_bank_transaction
--    - category:  written by truelayer-sync (txn.transaction_category) + apply_bank_rule
--    - updated_at: touched by post_bank_transaction / apply_bank_rule (+ audit)
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS bank_transactions_set_updated_at ON public.bank_transactions;
CREATE TRIGGER bank_transactions_set_updated_at
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Dedup TrueLayer GL accounts on reconnect. truelayer-callback looks up
--    bookkeeping_accounts by truelayer_account_id; without this column the lookup
--    always missed and created a duplicate GL account on every connect.
ALTER TABLE public.bookkeeping_accounts
  ADD COLUMN IF NOT EXISTS truelayer_account_id text;

CREATE INDEX IF NOT EXISTS idx_bookkeeping_accounts_truelayer
  ON public.bookkeeping_accounts (organization_id, truelayer_account_id)
  WHERE truelayer_account_id IS NOT NULL;

-- 3. Accountants must NOT initiate bank connections — TrueLayer connect is client-only.
--    Connections are created by the truelayer-callback edge function (service_role, which
--    bypasses RLS) or by the portal client (the allow_bank_connect policy). Remove the
--    org-admin INSERT vector. (SELECT/UPDATE/DELETE for managing existing connections stay.)
DROP POLICY IF EXISTS "org_admins_insert_bank_connections" ON public.bank_connections;
