-- ============================================================
-- SEC-6: portal read policies must honour the show_* visibility flags
-- ============================================================
-- The legacy portal SELECT policies on the bookkeeping/invoicing tables gate ONLY on
-- client_has_portal_access / portal_can_access_bookkeeping (i.e. "does this portal user have ANY
-- access to this client/company"). They ignore the per-flag toggles in portal_visibility_settings
-- (show_transactions / show_bank_accounts / show_trial_balance / show_detailed_ledger /
-- show_vat_returns / show_invoices). Because RLS SELECT policies are OR-combined, a portal user
-- granted access for ANY reason can query PostgREST directly and read all bank details, ledger,
-- trial balances, VAT returns and invoices even when the accountant toggled them off. The write
-- side was already fixed (20260607211245 per-perm rewrite); this closes the read side.
--
-- Approach: drop every portal SELECT policy on these tables DYNAMICALLY (matched by the portal
-- access helpers), so this converges regardless of the historical policy-name churn / live drift,
-- then install one canonical policy per table gated on portal_has_perm(..., '<flag>'). Note
-- portal_has_perm itself first checks portal_can_access_bookkeeping, so the access gate is
-- preserved — we are only ADDING the flag requirement.
--
-- Staff/org policies (gated on user_has_organization_access) are untouched: portal users are not
-- organization members, so those never grant portal access and are not the leak.
--
-- Invoices additionally hide non-issued states from the portal (DRAFT / VOIDED and any anomalous
-- status) via an allowlist of issued statuses; invoice_lines / invoice_payments follow the parent
-- invoice's visibility + status.
-- ============================================================

-- 1. Drop all existing portal SELECT policies on the target tables (drift-proof).
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

-- 2. Install canonical flag-gated portal SELECT policies (idempotent: drop-by-name then create).

-- bank_transactions -> show_transactions
DROP POLICY IF EXISTS "Portal clients view bank transactions when permitted" ON public.bank_transactions;
CREATE POLICY "Portal clients view bank transactions when permitted"
  ON public.bank_transactions FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_transactions'));

-- bank_accounts -> show_bank_accounts
DROP POLICY IF EXISTS "Portal clients view bank accounts when permitted" ON public.bank_accounts;
CREATE POLICY "Portal clients view bank accounts when permitted"
  ON public.bank_accounts FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_bank_accounts'));

-- vat_returns -> show_vat_returns
DROP POLICY IF EXISTS "Portal clients view VAT returns when permitted" ON public.vat_returns;
CREATE POLICY "Portal clients view VAT returns when permitted"
  ON public.vat_returns FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_vat_returns'));

-- ledger_entries -> show_detailed_ledger
DROP POLICY IF EXISTS "Portal clients view ledger entries when permitted" ON public.ledger_entries;
CREATE POLICY "Portal clients view ledger entries when permitted"
  ON public.ledger_entries FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_detailed_ledger'));

-- bookkeeping_accounts -> show_detailed_ledger
DROP POLICY IF EXISTS "Portal clients view accounts when permitted" ON public.bookkeeping_accounts;
CREATE POLICY "Portal clients view accounts when permitted"
  ON public.bookkeeping_accounts FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_detailed_ledger'));

-- trial_balance_snapshots -> show_trial_balance
DROP POLICY IF EXISTS "Portal clients view trial balance when permitted" ON public.trial_balance_snapshots;
CREATE POLICY "Portal clients view trial balance when permitted"
  ON public.trial_balance_snapshots FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_trial_balance'));

-- invoices -> show_invoices, issued statuses only (hide DRAFT / VOIDED / anomalous)
DROP POLICY IF EXISTS "Portal clients view invoices when permitted" ON public.invoices;
CREATE POLICY "Portal clients view invoices when permitted"
  ON public.invoices FOR SELECT TO authenticated
  USING (
    public.portal_has_perm(client_id, company_id, 'show_invoices')
    AND status IN ('AWAITING_PAYMENT', 'PART_PAID', 'PAID', 'OVERDUE')
  );

-- invoice_lines -> follow parent invoice visibility + issued status
DROP POLICY IF EXISTS "Portal clients view invoice lines when permitted" ON public.invoice_lines;
CREATE POLICY "Portal clients view invoice lines when permitted"
  ON public.invoice_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND public.portal_has_perm(i.client_id, i.company_id, 'show_invoices')
      AND i.status IN ('AWAITING_PAYMENT', 'PART_PAID', 'PAID', 'OVERDUE')
  ));

-- invoice_payments -> follow parent invoice visibility + issued status
DROP POLICY IF EXISTS "Portal clients view invoice payments when permitted" ON public.invoice_payments;
CREATE POLICY "Portal clients view invoice payments when permitted"
  ON public.invoice_payments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_payments.invoice_id
      AND public.portal_has_perm(i.client_id, i.company_id, 'show_invoices')
      AND i.status IN ('AWAITING_PAYMENT', 'PART_PAID', 'PAID', 'OVERDUE')
  ));

-- 3. Diagnostic: surface (do NOT auto-drop) any residual portal FOR ALL policy on these tables,
-- which would OR-combine to re-open the read leak. Writes were rewritten per-perm in 20260607211245,
-- so none is expected — but flag it for a live check rather than silently trusting git.
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
