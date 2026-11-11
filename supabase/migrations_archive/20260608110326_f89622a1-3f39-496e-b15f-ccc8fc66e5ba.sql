
ALTER TABLE public.portal_visibility_settings
  ADD COLUMN IF NOT EXISTS full_bookkeeping_access boolean NOT NULL DEFAULT false;

ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS created_by_portal boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS created_by_portal boolean NOT NULL DEFAULT false;
ALTER TABLE public.bill_payments
  ADD COLUMN IF NOT EXISTS created_by_portal boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_portal_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.portal_access WHERE user_id = auth.uid() AND is_active = true);
$$;
GRANT EXECUTE ON FUNCTION public.is_portal_user() TO authenticated;

CREATE OR REPLACE FUNCTION public.stamp_created_by_portal()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_portal_user() THEN
    NEW.created_by_portal := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_portal_ledger ON public.ledger_entries;
CREATE TRIGGER trg_stamp_portal_ledger BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.stamp_created_by_portal();
DROP TRIGGER IF EXISTS trg_stamp_portal_inv_pay ON public.invoice_payments;
CREATE TRIGGER trg_stamp_portal_inv_pay BEFORE INSERT ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_created_by_portal();
DROP TRIGGER IF EXISTS trg_stamp_portal_bill_pay ON public.bill_payments;
CREATE TRIGGER trg_stamp_portal_bill_pay BEFORE INSERT ON public.bill_payments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_created_by_portal();

CREATE OR REPLACE FUNCTION public.portal_has_perm(
  _client_id uuid, _company_id uuid, _permission text
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v boolean; v_master boolean;
BEGIN
  IF _permission NOT IN (
    'allow_bank_connect','allow_transaction_explain','allow_receipt_upload',
    'allow_invoice_create','allow_invoice_send','show_bills','allow_bill_create',
    'show_vat_returns','allow_vat_approval',
    'show_reports_summary','show_reports_detail','allow_reports_download',
    'show_bank_accounts','show_transactions','show_invoices','show_trial_balance',
    'show_detailed_ledger','full_bookkeeping'
  ) THEN RETURN false; END IF;

  IF NOT public.portal_can_access_bookkeeping(_client_id, _company_id) THEN RETURN false; END IF;

  IF _client_id IS NOT NULL THEN
    SELECT COALESCE(full_bookkeeping_access, false) INTO v_master
      FROM public.portal_visibility_settings WHERE client_id = _client_id LIMIT 1;
  ELSIF _company_id IS NOT NULL THEN
    SELECT COALESCE(full_bookkeeping_access, false) INTO v_master
      FROM public.portal_visibility_settings WHERE company_id = _company_id LIMIT 1;
  END IF;

  IF COALESCE(v_master, false) THEN RETURN true; END IF;
  IF _permission = 'full_bookkeeping' THEN RETURN false; END IF;

  IF _client_id IS NOT NULL THEN
    EXECUTE format('SELECT COALESCE(%I, false) FROM public.portal_visibility_settings WHERE client_id = $1 LIMIT 1', _permission)
      INTO v USING _client_id;
  ELSIF _company_id IS NOT NULL THEN
    EXECUTE format('SELECT COALESCE(%I, false) FROM public.portal_visibility_settings WHERE company_id = $1 LIMIT 1', _permission)
      INTO v USING _company_id;
  ELSE RETURN false; END IF;

  RETURN COALESCE(v, false);
END
$$;

-- ledger_entries
DROP POLICY IF EXISTS "Portal full bookkeeping insert ledger" ON public.ledger_entries;
CREATE POLICY "Portal full bookkeeping insert ledger" ON public.ledger_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.portal_has_perm(client_id, company_id, 'full_bookkeeping')
    AND COALESCE(is_locked, false) = false
  );

DROP POLICY IF EXISTS "Portal full bookkeeping update ledger" ON public.ledger_entries;
CREATE POLICY "Portal full bookkeeping update ledger" ON public.ledger_entries
  FOR UPDATE TO authenticated
  USING (
    public.portal_has_perm(client_id, company_id, 'full_bookkeeping')
    AND created_by_portal = true
    AND COALESCE(is_locked, false) = false
  )
  WITH CHECK (
    public.portal_has_perm(client_id, company_id, 'full_bookkeeping')
    AND COALESCE(is_locked, false) = false
  );

-- bank_transactions UPDATE
DROP POLICY IF EXISTS "Portal full bookkeeping update bank txn" ON public.bank_transactions;
CREATE POLICY "Portal full bookkeeping update bank txn" ON public.bank_transactions
  FOR UPDATE TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'full_bookkeeping'))
  WITH CHECK (public.portal_has_perm(client_id, company_id, 'full_bookkeeping'));

-- invoice_payments
DROP POLICY IF EXISTS "Portal full bookkeeping insert invoice payments" ON public.invoice_payments;
CREATE POLICY "Portal full bookkeeping insert invoice payments" ON public.invoice_payments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = invoice_payments.invoice_id
      AND public.portal_has_perm(i.client_id, i.company_id, 'full_bookkeeping')
  ));

DROP POLICY IF EXISTS "Portal full bookkeeping update invoice payments" ON public.invoice_payments;
CREATE POLICY "Portal full bookkeeping update invoice payments" ON public.invoice_payments
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = invoice_payments.invoice_id
      AND public.portal_has_perm(i.client_id, i.company_id, 'full_bookkeeping')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = invoice_payments.invoice_id
      AND public.portal_has_perm(i.client_id, i.company_id, 'full_bookkeeping')
  ));

-- bill_payments
DROP POLICY IF EXISTS "Portal view bill payments" ON public.bill_payments;
CREATE POLICY "Portal view bill payments" ON public.bill_payments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bills b WHERE b.id = bill_payments.bill_id
      AND public.portal_has_perm(b.client_id, b.company_id, 'show_bills')
  ));

DROP POLICY IF EXISTS "Portal full bookkeeping insert bill payments" ON public.bill_payments;
CREATE POLICY "Portal full bookkeeping insert bill payments" ON public.bill_payments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bills b WHERE b.id = bill_payments.bill_id
      AND public.portal_has_perm(b.client_id, b.company_id, 'full_bookkeeping')
  ));

DROP POLICY IF EXISTS "Portal full bookkeeping update bill payments" ON public.bill_payments;
CREATE POLICY "Portal full bookkeeping update bill payments" ON public.bill_payments
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bills b WHERE b.id = bill_payments.bill_id
      AND public.portal_has_perm(b.client_id, b.company_id, 'full_bookkeeping')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bills b WHERE b.id = bill_payments.bill_id
      AND public.portal_has_perm(b.client_id, b.company_id, 'full_bookkeeping')
  ));

-- vat_returns UPDATE
DROP POLICY IF EXISTS "Portal full bookkeeping update vat returns" ON public.vat_returns;
CREATE POLICY "Portal full bookkeeping update vat returns" ON public.vat_returns
  FOR UPDATE TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'full_bookkeeping'))
  WITH CHECK (public.portal_has_perm(client_id, company_id, 'full_bookkeeping'));

-- reconciliations
DROP POLICY IF EXISTS "Portal full bookkeeping rw reconciliations" ON public.reconciliations;
CREATE POLICY "Portal full bookkeeping rw reconciliations" ON public.reconciliations
  FOR ALL TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'full_bookkeeping'))
  WITH CHECK (public.portal_has_perm(client_id, company_id, 'full_bookkeeping'));

-- reconciliation_lines (no direct client/company; join via reconciliations)
DROP POLICY IF EXISTS "Portal full bookkeeping rw reconciliation lines" ON public.reconciliation_lines;
CREATE POLICY "Portal full bookkeeping rw reconciliation lines" ON public.reconciliation_lines
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.reconciliations r
    WHERE r.id = reconciliation_lines.reconciliation_id
      AND public.portal_has_perm(r.client_id, r.company_id, 'full_bookkeeping')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.reconciliations r
    WHERE r.id = reconciliation_lines.reconciliation_id
      AND public.portal_has_perm(r.client_id, r.company_id, 'full_bookkeeping')
  ));

-- matching_candidates (no client/company; join via bank_transactions)
DROP POLICY IF EXISTS "Portal view matching candidates" ON public.matching_candidates;
CREATE POLICY "Portal view matching candidates" ON public.matching_candidates
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bank_transactions bt
    WHERE bt.id = matching_candidates.bank_transaction_id
      AND public.portal_has_perm(bt.client_id, bt.company_id, 'show_transactions')
  ));

DROP POLICY IF EXISTS "Portal full bookkeeping update matching candidates" ON public.matching_candidates;
CREATE POLICY "Portal full bookkeeping update matching candidates" ON public.matching_candidates
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bank_transactions bt
    WHERE bt.id = matching_candidates.bank_transaction_id
      AND public.portal_has_perm(bt.client_id, bt.company_id, 'full_bookkeeping')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bank_transactions bt
    WHERE bt.id = matching_candidates.bank_transaction_id
      AND public.portal_has_perm(bt.client_id, bt.company_id, 'full_bookkeeping')
  ));
