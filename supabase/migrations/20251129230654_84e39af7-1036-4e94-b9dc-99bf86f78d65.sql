-- Add RLS policies for client portal access to bookkeeping tables (read-only)

-- Ledger entries: Clients can view their own ledger entries
CREATE POLICY "Portal clients can view their ledger entries"
ON public.ledger_entries FOR SELECT
USING (client_has_portal_access(auth.uid(), client_id, company_id));

-- Bookkeeping accounts: Clients can view their own accounts
CREATE POLICY "Portal clients can view their accounts"
ON public.bookkeeping_accounts FOR SELECT
USING (client_has_portal_access(auth.uid(), client_id, company_id));

-- Invoices: Clients can view their own invoices
CREATE POLICY "Portal clients can view their invoices"
ON public.invoices FOR SELECT
USING (client_has_portal_access(auth.uid(), client_id, company_id));

-- Invoice lines: Clients can view lines for their invoices
CREATE POLICY "Portal clients can view their invoice lines"
ON public.invoice_lines FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_lines.invoice_id
    AND client_has_portal_access(auth.uid(), i.client_id, i.company_id)
  )
);

-- VAT returns: Clients can view their own VAT returns
CREATE POLICY "Portal clients can view their VAT returns"
ON public.vat_returns FOR SELECT
USING (client_has_portal_access(auth.uid(), client_id, company_id));

-- Bank transactions: Clients can view their own bank transactions
CREATE POLICY "Portal clients can view their bank transactions"
ON public.bank_transactions FOR SELECT
USING (client_has_portal_access(auth.uid(), client_id, company_id));

-- Bank accounts: Clients can view their own bank accounts
CREATE POLICY "Portal clients can view their bank accounts"
ON public.bank_accounts FOR SELECT
USING (client_has_portal_access(auth.uid(), client_id, company_id));

-- Trial balance snapshots: Clients can view their own snapshots
CREATE POLICY "Portal clients can view their trial balance snapshots"
ON public.trial_balance_snapshots FOR SELECT
USING (client_has_portal_access(auth.uid(), client_id, company_id));