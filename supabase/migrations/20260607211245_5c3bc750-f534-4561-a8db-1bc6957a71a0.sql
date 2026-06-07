-- S2: Extend portal_visibility_settings
ALTER TABLE public.portal_visibility_settings
  ADD COLUMN IF NOT EXISTS allow_bank_connect         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_transaction_explain  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_receipt_upload       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_invoice_create       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_invoice_send         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_bills                 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_bill_create          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_vat_returns           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_vat_approval         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_reports_summary       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_reports_detail        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_reports_download     boolean NOT NULL DEFAULT false;

-- Workflow columns
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS client_explained_status text,
  ADD COLUMN IF NOT EXISTS client_explained_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_explained_by uuid,
  ADD COLUMN IF NOT EXISTS client_explanation text,
  ADD COLUMN IF NOT EXISTS client_suggested_account_id uuid;

ALTER TABLE public.vat_returns
  ADD COLUMN IF NOT EXISTS client_approval_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_approved_by uuid;

-- Helper: portal_has_perm. Signature: (client_id, company_id, permission)
-- Uses existing portal_can_access_bookkeeping(_client_id uuid, _company_id uuid).
CREATE OR REPLACE FUNCTION public.portal_has_perm(
  _client_id uuid,
  _company_id uuid,
  _permission text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v boolean;
BEGIN
  IF _permission NOT IN (
    'allow_bank_connect','allow_transaction_explain','allow_receipt_upload',
    'allow_invoice_create','allow_invoice_send','show_bills','allow_bill_create',
    'show_vat_returns','allow_vat_approval',
    'show_reports_summary','show_reports_detail','allow_reports_download',
    'show_bank_accounts','show_transactions','show_invoices','show_trial_balance',
    'show_detailed_ledger'
  ) THEN
    RETURN false;
  END IF;

  IF NOT public.portal_can_access_bookkeeping(_client_id, _company_id) THEN
    RETURN false;
  END IF;

  IF _client_id IS NOT NULL THEN
    EXECUTE format(
      'SELECT COALESCE(%I, false) FROM public.portal_visibility_settings WHERE client_id = $1 LIMIT 1',
      _permission
    ) INTO v USING _client_id;
  ELSIF _company_id IS NOT NULL THEN
    EXECUTE format(
      'SELECT COALESCE(%I, false) FROM public.portal_visibility_settings WHERE company_id = $1 LIMIT 1',
      _permission
    ) INTO v USING _company_id;
  ELSE
    RETURN false;
  END IF;

  RETURN COALESCE(v, false);
END
$$;

GRANT EXECUTE ON FUNCTION public.portal_has_perm(uuid, uuid, text) TO authenticated;

-- S1: Drop blanket portal-full-access policies, install per-action policies

-- bank_accounts
DROP POLICY IF EXISTS "Portal bookkeeping full access" ON public.bank_accounts;

-- bank_connections
DROP POLICY IF EXISTS "Portal bookkeeping full access" ON public.bank_connections;
CREATE POLICY "Portal clients can view their bank connections"
  ON public.bank_connections FOR SELECT TO authenticated
  USING (public.portal_can_access_bookkeeping(client_id, company_id));
CREATE POLICY "Portal clients can start bank connect when permitted"
  ON public.bank_connections FOR INSERT TO authenticated
  WITH CHECK (public.portal_has_perm(client_id, company_id, 'allow_bank_connect'));

-- bank_transactions
DROP POLICY IF EXISTS "Portal bookkeeping full access" ON public.bank_transactions;

-- bank_rules
DROP POLICY IF EXISTS "Portal bookkeeping full access" ON public.bank_rules;

-- categorization_rules
DROP POLICY IF EXISTS "Portal bookkeeping full access" ON public.categorization_rules;

-- customers
DROP POLICY IF EXISTS "Portal bookkeeping full access" ON public.customers;
CREATE POLICY "Portal clients can view their customers"
  ON public.customers FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_invoices'));
CREATE POLICY "Portal clients can create customers when invoicing allowed"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.portal_has_perm(client_id, company_id, 'allow_invoice_create'));
CREATE POLICY "Portal clients can edit customers when invoicing allowed"
  ON public.customers FOR UPDATE TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'allow_invoice_create'))
  WITH CHECK (public.portal_has_perm(client_id, company_id, 'allow_invoice_create'));

-- suppliers
DROP POLICY IF EXISTS "Portal bookkeeping full access" ON public.suppliers;
CREATE POLICY "Portal clients can view their suppliers"
  ON public.suppliers FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_bills'));
CREATE POLICY "Portal clients can create suppliers when bills allowed"
  ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (public.portal_has_perm(client_id, company_id, 'allow_bill_create'));
CREATE POLICY "Portal clients can edit suppliers when bills allowed"
  ON public.suppliers FOR UPDATE TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'allow_bill_create'))
  WITH CHECK (public.portal_has_perm(client_id, company_id, 'allow_bill_create'));

-- invoices
DROP POLICY IF EXISTS "Portal bookkeeping full access" ON public.invoices;
CREATE POLICY "Portal clients can create draft invoices"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (
    public.portal_has_perm(client_id, company_id, 'allow_invoice_create')
    AND status = 'draft'
  );
CREATE POLICY "Portal clients can edit draft invoices"
  ON public.invoices FOR UPDATE TO authenticated
  USING (
    public.portal_has_perm(client_id, company_id, 'allow_invoice_create')
    AND status = 'draft'
  )
  WITH CHECK (
    public.portal_has_perm(client_id, company_id, 'allow_invoice_create')
    AND status IN ('draft','sent')
  );

-- invoice_lines
DROP POLICY IF EXISTS "Portal bookkeeping full access lines" ON public.invoice_lines;
CREATE POLICY "Portal clients can view invoice lines"
  ON public.invoice_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND public.portal_can_access_bookkeeping(i.client_id, i.company_id)
  ));
CREATE POLICY "Portal clients can write draft invoice lines"
  ON public.invoice_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND i.status = 'draft'
      AND public.portal_has_perm(i.client_id, i.company_id, 'allow_invoice_create')
  ));
CREATE POLICY "Portal clients can update draft invoice lines"
  ON public.invoice_lines FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND i.status = 'draft'
      AND public.portal_has_perm(i.client_id, i.company_id, 'allow_invoice_create')
  ));
CREATE POLICY "Portal clients can delete draft invoice lines"
  ON public.invoice_lines FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND i.status = 'draft'
      AND public.portal_has_perm(i.client_id, i.company_id, 'allow_invoice_create')
  ));

-- invoice_payments
DROP POLICY IF EXISTS "Portal bookkeeping full access payments" ON public.invoice_payments;

-- credit_notes / credit_note_lines
DROP POLICY IF EXISTS "Portal bookkeeping full access" ON public.credit_notes;
DROP POLICY IF EXISTS "Portal bookkeeping full access cn lines" ON public.credit_note_lines;

-- bills
DROP POLICY IF EXISTS "Portal bookkeeping full access" ON public.bills;
CREATE POLICY "Portal clients can view their bills"
  ON public.bills FOR SELECT TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'show_bills'));
CREATE POLICY "Portal clients can create draft bills"
  ON public.bills FOR INSERT TO authenticated
  WITH CHECK (
    public.portal_has_perm(client_id, company_id, 'allow_bill_create')
    AND status = 'draft'
  );
CREATE POLICY "Portal clients can edit draft bills"
  ON public.bills FOR UPDATE TO authenticated
  USING (
    public.portal_has_perm(client_id, company_id, 'allow_bill_create')
    AND status = 'draft'
  )
  WITH CHECK (
    public.portal_has_perm(client_id, company_id, 'allow_bill_create')
    AND status IN ('draft','awaiting_review')
  );

-- bill_lines
DROP POLICY IF EXISTS "Portal bookkeeping full access bill lines" ON public.bill_lines;
CREATE POLICY "Portal clients can view bill lines"
  ON public.bill_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bills b
    WHERE b.id = bill_lines.bill_id
      AND public.portal_has_perm(b.client_id, b.company_id, 'show_bills')
  ));
CREATE POLICY "Portal clients can write draft bill lines"
  ON public.bill_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bills b
    WHERE b.id = bill_lines.bill_id
      AND b.status = 'draft'
      AND public.portal_has_perm(b.client_id, b.company_id, 'allow_bill_create')
  ));
CREATE POLICY "Portal clients can update draft bill lines"
  ON public.bill_lines FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bills b
    WHERE b.id = bill_lines.bill_id
      AND b.status = 'draft'
      AND public.portal_has_perm(b.client_id, b.company_id, 'allow_bill_create')
  ));
CREATE POLICY "Portal clients can delete draft bill lines"
  ON public.bill_lines FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bills b
    WHERE b.id = bill_lines.bill_id
      AND b.status = 'draft'
      AND public.portal_has_perm(b.client_id, b.company_id, 'allow_bill_create')
  ));

-- bill_payments
DROP POLICY IF EXISTS "Portal bookkeeping full access bill payments" ON public.bill_payments;

-- receipts
DROP POLICY IF EXISTS "Portal bookkeeping full access" ON public.receipts;
CREATE POLICY "Portal clients can view their receipts"
  ON public.receipts FOR SELECT TO authenticated
  USING (
    public.portal_has_perm(client_id, company_id, 'allow_receipt_upload')
    OR public.portal_can_access_bookkeeping(client_id, company_id)
  );
CREATE POLICY "Portal clients can upload receipts"
  ON public.receipts FOR INSERT TO authenticated
  WITH CHECK (public.portal_has_perm(client_id, company_id, 'allow_receipt_upload'));
CREATE POLICY "Portal clients can edit own receipts"
  ON public.receipts FOR UPDATE TO authenticated
  USING (public.portal_has_perm(client_id, company_id, 'allow_receipt_upload'))
  WITH CHECK (public.portal_has_perm(client_id, company_id, 'allow_receipt_upload'));

-- RPC: portal_explain_transaction
CREATE OR REPLACE FUNCTION public.portal_explain_transaction(
  _transaction_id uuid,
  _explanation text,
  _suggested_account_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn public.bank_transactions%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_txn FROM public.bank_transactions WHERE id = _transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction_not_found'; END IF;

  IF NOT public.portal_has_perm(v_txn.client_id, v_txn.company_id, 'allow_transaction_explain') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  UPDATE public.bank_transactions
     SET client_explanation          = _explanation,
         client_suggested_account_id = _suggested_account_id,
         client_explained_status     = 'client_explained',
         client_explained_at         = now(),
         client_explained_by         = v_uid,
         updated_at                  = now()
   WHERE id = _transaction_id;

  INSERT INTO public.bookkeeping_audit_log
    (organization_id, entity_type, entity_id, action, actor_id, actor_role, after_state, metadata)
  VALUES (
    v_txn.organization_id,
    CASE WHEN v_txn.client_id IS NOT NULL THEN 'client' ELSE 'company' END,
    COALESCE(v_txn.client_id, v_txn.company_id),
    'portal.transaction.explained',
    v_uid,
    'portal_client',
    jsonb_build_object(
      'transaction_id', _transaction_id,
      'explanation', _explanation,
      'suggested_account_id', _suggested_account_id
    ),
    jsonb_build_object('source','portal')
  );

  RETURN _transaction_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.portal_explain_transaction(uuid, text, uuid) TO authenticated;

-- RPC: portal_approve_vat_return
CREATE OR REPLACE FUNCTION public.portal_approve_vat_return(_vat_return_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ret public.vat_returns%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_ret FROM public.vat_returns WHERE id = _vat_return_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'vat_return_not_found'; END IF;

  IF NOT public.portal_has_perm(v_ret.client_id, v_ret.company_id, 'allow_vat_approval') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF NOT COALESCE(v_ret.client_approval_required, false) THEN
    RAISE EXCEPTION 'approval_not_requested';
  END IF;

  IF v_ret.client_approved_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_approved';
  END IF;

  UPDATE public.vat_returns
     SET client_approved_at = now(),
         client_approved_by = v_uid,
         updated_at         = now()
   WHERE id = _vat_return_id;

  INSERT INTO public.bookkeeping_audit_log
    (organization_id, entity_type, entity_id, action, actor_id, actor_role, after_state, metadata)
  VALUES (
    v_ret.organization_id,
    CASE WHEN v_ret.client_id IS NOT NULL THEN 'client' ELSE 'company' END,
    COALESCE(v_ret.client_id, v_ret.company_id),
    'portal.vat_return.approved',
    v_uid,
    'portal_client',
    jsonb_build_object('vat_return_id', _vat_return_id),
    jsonb_build_object('source','portal')
  );

  RETURN _vat_return_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.portal_approve_vat_return(uuid) TO authenticated;

-- RPC: log_portal_bookkeeping_action
CREATE OR REPLACE FUNCTION public.log_portal_bookkeeping_action(
  _entity_type text,
  _entity_id uuid,
  _action text,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_log_id uuid;
  v_client_id uuid;
  v_company_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _entity_type NOT IN ('client','company') THEN RAISE EXCEPTION 'bad_entity_type'; END IF;

  IF _entity_type = 'client' THEN v_client_id := _entity_id; ELSE v_company_id := _entity_id; END IF;

  IF NOT public.portal_can_access_bookkeeping(v_client_id, v_company_id) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF _entity_type = 'client' THEN
    SELECT organization_id INTO v_org FROM public.clients WHERE id = _entity_id;
  ELSE
    SELECT organization_id INTO v_org FROM public.companies WHERE id = _entity_id;
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'entity_not_found'; END IF;

  INSERT INTO public.bookkeeping_audit_log
    (organization_id, entity_type, entity_id, action, actor_id, actor_role, metadata)
  VALUES (v_org, _entity_type, _entity_id, _action, v_uid, 'portal_client',
          jsonb_build_object('source','portal') || COALESCE(_details, '{}'::jsonb))
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.log_portal_bookkeeping_action(text, uuid, text, jsonb) TO authenticated;