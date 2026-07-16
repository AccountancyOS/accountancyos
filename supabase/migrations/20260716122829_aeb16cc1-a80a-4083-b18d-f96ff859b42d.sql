-- SEC-6: portal read policies must honour the show_* visibility flags
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'SELECT'
      AND tablename IN (
        'invoices', 'invoice_lines', 'invoice_payments', 'vat_returns',
        'bank_transactions', 'bank_accounts', 'ledger_entries',
        'bookkeeping_accounts', 'trial_balance_snapshots'
      )
      AND (
        qual ILIKE '%client_has_portal_access%'
        OR qual ILIKE '%portal_can_access_bookkeeping%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'SEC-6: dropped legacy portal SELECT policy % on %', r.policyname, r.tablename;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Portal clients view bank transactions when permitted" ON public.bank_transactions;
CREATE POLICY "Portal clients view bank transactions when permitted"
  ON public.bank_transactions FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_transactions'));

DROP POLICY IF EXISTS "Portal clients view bank accounts when permitted" ON public.bank_accounts;
CREATE POLICY "Portal clients view bank accounts when permitted"
  ON public.bank_accounts FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_bank_accounts'));

DROP POLICY IF EXISTS "Portal clients view VAT returns when permitted" ON public.vat_returns;
CREATE POLICY "Portal clients view VAT returns when permitted"
  ON public.vat_returns FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_vat_returns'));

DROP POLICY IF EXISTS "Portal clients view ledger entries when permitted" ON public.ledger_entries;
CREATE POLICY "Portal clients view ledger entries when permitted"
  ON public.ledger_entries FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_detailed_ledger'));

DROP POLICY IF EXISTS "Portal clients view accounts when permitted" ON public.bookkeeping_accounts;
CREATE POLICY "Portal clients view accounts when permitted"
  ON public.bookkeeping_accounts FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_detailed_ledger'));

DROP POLICY IF EXISTS "Portal clients view trial balance when permitted" ON public.trial_balance_snapshots;
CREATE POLICY "Portal clients view trial balance when permitted"
  ON public.trial_balance_snapshots FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_trial_balance'));

DROP POLICY IF EXISTS "Portal clients view invoices when permitted" ON public.invoices;
CREATE POLICY "Portal clients view invoices when permitted"
  ON public.invoices FOR SELECT TO authenticated
  USING (
    public.portal_has_perm(client_id, company_id, 'show_invoices')
    AND status IN ('AWAITING_PAYMENT', 'PART_PAID', 'PAID', 'OVERDUE')
  );

DROP POLICY IF EXISTS "Portal clients view invoice lines when permitted" ON public.invoice_lines;
CREATE POLICY "Portal clients view invoice lines when permitted"
  ON public.invoice_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND public.portal_has_perm(i.client_id, i.company_id, 'show_invoices')
      AND i.status IN ('AWAITING_PAYMENT', 'PART_PAID', 'PAID', 'OVERDUE')
  ));

DROP POLICY IF EXISTS "Portal clients view invoice payments when permitted" ON public.invoice_payments;
CREATE POLICY "Portal clients view invoice payments when permitted"
  ON public.invoice_payments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_payments.invoice_id
      AND public.portal_has_perm(i.client_id, i.company_id, 'show_invoices')
      AND i.status IN ('AWAITING_PAYMENT', 'PART_PAID', 'PAID', 'OVERDUE')
  ));

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'ALL'
      AND tablename IN (
        'invoices', 'invoice_lines', 'invoice_payments', 'vat_returns',
        'bank_transactions', 'bank_accounts', 'ledger_entries',
        'bookkeeping_accounts', 'trial_balance_snapshots'
      )
      AND (
        qual ILIKE '%client_has_portal_access%'
        OR qual ILIKE '%portal_can_access_bookkeeping%'
      )
  LOOP
    RAISE WARNING 'SEC-6 RESIDUAL: portal FOR ALL policy % on % still grants reads bypassing show_* flags — review.', r.policyname, r.tablename;
  END LOOP;
END $$;