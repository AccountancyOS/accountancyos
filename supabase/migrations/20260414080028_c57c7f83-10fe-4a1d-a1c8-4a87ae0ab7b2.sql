
-- ============================================================
-- PHASE 1A: Add missing write RLS policies
-- ============================================================

-- BILLS: Add INSERT, UPDATE, DELETE
CREATE POLICY "bills_insert_org" ON public.bills
  FOR INSERT TO authenticated
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "bills_update_org" ON public.bills
  FOR UPDATE TO authenticated
  USING (user_has_organization_access(organization_id))
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "bills_delete_org" ON public.bills
  FOR DELETE TO authenticated
  USING (user_has_organization_access(organization_id));

-- BILL_LINES: Add INSERT, UPDATE, DELETE (via parent bill)
CREATE POLICY "bill_lines_insert_org" ON public.bill_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_lines.bill_id AND user_has_organization_access(b.organization_id))
  );

CREATE POLICY "bill_lines_update_org" ON public.bill_lines
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_lines.bill_id AND user_has_organization_access(b.organization_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_lines.bill_id AND user_has_organization_access(b.organization_id))
  );

CREATE POLICY "bill_lines_delete_org" ON public.bill_lines
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_lines.bill_id AND user_has_organization_access(b.organization_id))
  );

-- BILL_PAYMENTS: Add INSERT, UPDATE, DELETE (via parent bill)
CREATE POLICY "bill_payments_insert_org" ON public.bill_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_payments.bill_id AND user_has_organization_access(b.organization_id))
  );

CREATE POLICY "bill_payments_update_org" ON public.bill_payments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_payments.bill_id AND user_has_organization_access(b.organization_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_payments.bill_id AND user_has_organization_access(b.organization_id))
  );

CREATE POLICY "bill_payments_delete_org" ON public.bill_payments
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_payments.bill_id AND user_has_organization_access(b.organization_id))
  );

-- INVOICE_LINES: Add INSERT, UPDATE, DELETE (via parent invoice)
CREATE POLICY "invoice_lines_insert_org" ON public.invoice_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_lines.invoice_id AND user_has_organization_access(i.organization_id))
  );

CREATE POLICY "invoice_lines_update_org" ON public.invoice_lines
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_lines.invoice_id AND user_has_organization_access(i.organization_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_lines.invoice_id AND user_has_organization_access(i.organization_id))
  );

CREATE POLICY "invoice_lines_delete_org" ON public.invoice_lines
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_lines.invoice_id AND user_has_organization_access(i.organization_id))
  );

-- INVOICE_PAYMENTS: Add INSERT, UPDATE, DELETE (via parent invoice)
CREATE POLICY "invoice_payments_insert_org" ON public.invoice_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_payments.invoice_id AND user_has_organization_access(i.organization_id))
  );

CREATE POLICY "invoice_payments_update_org" ON public.invoice_payments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_payments.invoice_id AND user_has_organization_access(i.organization_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_payments.invoice_id AND user_has_organization_access(i.organization_id))
  );

CREATE POLICY "invoice_payments_delete_org" ON public.invoice_payments
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_payments.invoice_id AND user_has_organization_access(i.organization_id))
  );

-- EMAIL_QUEUE: Add INSERT, UPDATE, DELETE
CREATE POLICY "email_queue_insert_org" ON public.email_queue
  FOR INSERT TO authenticated
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "email_queue_update_org" ON public.email_queue
  FOR UPDATE TO authenticated
  USING (user_has_organization_access(organization_id))
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "email_queue_delete_org" ON public.email_queue
  FOR DELETE TO authenticated
  USING (user_has_organization_access(organization_id));

-- NOTIFICATIONS: Add INSERT
CREATE POLICY "notifications_insert_org" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_has_organization_access(organization_id));

-- ============================================================
-- PHASE 2C: Harden connected_mailboxes & gmail_auth_states
-- ============================================================

-- connected_mailboxes: Add org check to SELECT, UPDATE, DELETE
DROP POLICY IF EXISTS "Users can view their own mailboxes" ON public.connected_mailboxes;
DROP POLICY IF EXISTS "Users can update their own mailboxes" ON public.connected_mailboxes;
DROP POLICY IF EXISTS "Users can delete their own mailboxes" ON public.connected_mailboxes;

CREATE POLICY "Users can view their own mailboxes" ON public.connected_mailboxes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND user_has_organization_access(organization_id));

CREATE POLICY "Users can update their own mailboxes" ON public.connected_mailboxes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND user_has_organization_access(organization_id))
  WITH CHECK (user_id = auth.uid() AND user_has_organization_access(organization_id));

CREATE POLICY "Users can delete their own mailboxes" ON public.connected_mailboxes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND user_has_organization_access(organization_id));

-- gmail_auth_states: The INSERT policy already has WITH CHECK (user_id = auth.uid()), which is correct.
-- No change needed.

-- ============================================================
-- PHASE 4: Cleanup duplicate policies
-- ============================================================

-- user_saved_views: Remove the older set of duplicates
DROP POLICY IF EXISTS "user_saved_views_select_own" ON public.user_saved_views;
DROP POLICY IF EXISTS "user_saved_views_insert_own" ON public.user_saved_views;
DROP POLICY IF EXISTS "user_saved_views_update_own" ON public.user_saved_views;
DROP POLICY IF EXISTS "user_saved_views_delete_own" ON public.user_saved_views;

-- ledger_entries: Remove duplicate SELECT policy
-- The canonical one is "Users can view ledger entries in their organization"
DROP POLICY IF EXISTS "View ledger entries" ON public.ledger_entries;

-- api_rate_limits: Add basic org-scoped policies
CREATE POLICY "api_rate_limits_select_org" ON public.api_rate_limits
  FOR SELECT TO authenticated
  USING (user_has_organization_access(organization_id));

CREATE POLICY "api_rate_limits_insert_org" ON public.api_rate_limits
  FOR INSERT TO authenticated
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "api_rate_limits_update_org" ON public.api_rate_limits
  FOR UPDATE TO authenticated
  USING (user_has_organization_access(organization_id));
