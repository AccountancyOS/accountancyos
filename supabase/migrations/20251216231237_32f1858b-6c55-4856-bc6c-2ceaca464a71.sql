-- Phase 11 Permissions Hardening: Fix RLS Policies (Part 2)

-- ============================================================================
-- PART 1: Drop ALL existing policies on invoices (including portal)
-- ============================================================================

DROP POLICY IF EXISTS "Portal clients can view their invoices" ON public.invoices;
DROP POLICY IF EXISTS "Org members can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Staff can create invoices" ON public.invoices;
DROP POLICY IF EXISTS "Staff can update draft invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can delete draft invoices" ON public.invoices;

-- Recreate portal policy with different name
CREATE POLICY "Portal clients view their invoices"
ON public.invoices FOR SELECT
TO authenticated
USING (
  (client_id IS NOT NULL AND public.client_has_portal_access(auth.uid(), client_id, NULL))
  OR (company_id IS NOT NULL AND public.client_has_portal_access(auth.uid(), NULL, company_id))
);

-- ============================================================================
-- PART 2: Fix RLS policies for invoice_lines
-- ============================================================================

DROP POLICY IF EXISTS "Users can view invoice lines" ON public.invoice_lines;
DROP POLICY IF EXISTS "Staff can create invoice lines for draft invoices" ON public.invoice_lines;
DROP POLICY IF EXISTS "Staff can update invoice lines for draft invoices" ON public.invoice_lines;
DROP POLICY IF EXISTS "Staff can delete invoice lines for draft invoices" ON public.invoice_lines;

-- SELECT: Follow parent invoice access
CREATE POLICY "View invoice lines"
ON public.invoice_lines FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i 
    WHERE i.id = invoice_id 
    AND public.user_has_organization_access(i.organization_id)
  )
);

-- INSERT: Staff+ only, and only if parent invoice is DRAFT
CREATE POLICY "Staff create invoice lines for draft"
ON public.invoice_lines FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i 
    WHERE i.id = invoice_id 
    AND i.status = 'DRAFT'
    AND public.user_has_role_at_least(auth.uid(), i.organization_id, 'staff')
  )
);

-- UPDATE: Staff+ for DRAFT parent, Admin+ for any
CREATE POLICY "Staff update invoice lines for draft"
ON public.invoice_lines FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i 
    WHERE i.id = invoice_id 
    AND (
      (i.status = 'DRAFT' AND public.user_has_role_at_least(auth.uid(), i.organization_id, 'staff'))
      OR public.user_has_role_at_least(auth.uid(), i.organization_id, 'admin')
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i 
    WHERE i.id = invoice_id 
    AND (
      (i.status = 'DRAFT' AND public.user_has_role_at_least(auth.uid(), i.organization_id, 'staff'))
      OR public.user_has_role_at_least(auth.uid(), i.organization_id, 'admin')
    )
  )
);

-- DELETE: Staff+ for DRAFT parent, Admin+ for any
CREATE POLICY "Staff delete invoice lines for draft"
ON public.invoice_lines FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i 
    WHERE i.id = invoice_id 
    AND (
      (i.status = 'DRAFT' AND public.user_has_role_at_least(auth.uid(), i.organization_id, 'staff'))
      OR public.user_has_role_at_least(auth.uid(), i.organization_id, 'admin')
    )
  )
);

-- ============================================================================
-- PART 3: Fix RLS policies for invoice_payments
-- ============================================================================

DROP POLICY IF EXISTS "Users can view invoice payments" ON public.invoice_payments;
DROP POLICY IF EXISTS "Managers can record invoice payments" ON public.invoice_payments;
DROP POLICY IF EXISTS "Admins can update invoice payments" ON public.invoice_payments;
DROP POLICY IF EXISTS "Admins can delete invoice payments" ON public.invoice_payments;

-- SELECT: All org members can view
CREATE POLICY "View invoice payments"
ON public.invoice_payments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i 
    WHERE i.id = invoice_id 
    AND public.user_has_organization_access(i.organization_id)
  )
);

-- INSERT: Manager+ only (recording payments is significant)
CREATE POLICY "Managers record invoice payments"
ON public.invoice_payments FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i 
    WHERE i.id = invoice_id 
    AND public.user_has_role_at_least(auth.uid(), i.organization_id, 'manager')
  )
);

-- UPDATE: Admin+ only
CREATE POLICY "Admins update invoice payments"
ON public.invoice_payments FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i 
    WHERE i.id = invoice_id 
    AND public.user_has_role_at_least(auth.uid(), i.organization_id, 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i 
    WHERE i.id = invoice_id 
    AND public.user_has_role_at_least(auth.uid(), i.organization_id, 'admin')
  )
);

-- DELETE: Admin+ only
CREATE POLICY "Admins delete invoice payments"
ON public.invoice_payments FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i 
    WHERE i.id = invoice_id 
    AND public.user_has_role_at_least(auth.uid(), i.organization_id, 'admin')
  )
);

-- ============================================================================
-- PART 4: Fix RLS policies for bills
-- ============================================================================

DROP POLICY IF EXISTS "Users can view bills" ON public.bills;
DROP POLICY IF EXISTS "Users can create bills" ON public.bills;
DROP POLICY IF EXISTS "Users can update bills" ON public.bills;
DROP POLICY IF EXISTS "Users can delete bills" ON public.bills;
DROP POLICY IF EXISTS "Org members can view bills" ON public.bills;
DROP POLICY IF EXISTS "Staff can create bills" ON public.bills;
DROP POLICY IF EXISTS "Staff can update draft bills" ON public.bills;
DROP POLICY IF EXISTS "Admins can delete draft bills" ON public.bills;

-- SELECT: All org members can view
CREATE POLICY "View bills"
ON public.bills FOR SELECT
TO authenticated
USING (public.user_has_organization_access(organization_id));

-- INSERT: Staff+ only
CREATE POLICY "Staff create bills"
ON public.bills FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_organization_access(organization_id)
  AND public.user_has_role_at_least(auth.uid(), organization_id, 'staff')
);

-- UPDATE: Staff+ for DRAFT, Admin+ for any
CREATE POLICY "Staff update draft bills"
ON public.bills FOR UPDATE
TO authenticated
USING (
  public.user_has_organization_access(organization_id)
  AND (
    (status = 'DRAFT' AND public.user_has_role_at_least(auth.uid(), organization_id, 'staff'))
    OR public.user_has_role_at_least(auth.uid(), organization_id, 'admin')
  )
)
WITH CHECK (
  public.user_has_organization_access(organization_id)
  AND (
    (status = 'DRAFT' AND public.user_has_role_at_least(auth.uid(), organization_id, 'staff'))
    OR public.user_has_role_at_least(auth.uid(), organization_id, 'admin')
  )
);

-- DELETE: Admin+ only for DRAFT
CREATE POLICY "Admins delete draft bills"
ON public.bills FOR DELETE
TO authenticated
USING (
  public.user_has_organization_access(organization_id)
  AND status = 'DRAFT'
  AND public.user_has_role_at_least(auth.uid(), organization_id, 'admin')
);

-- ============================================================================
-- PART 5: Fix RLS policies for email_queue
-- ============================================================================

DROP POLICY IF EXISTS "Users can view email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Users can insert email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Users can update email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Users can delete email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Org members can view email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Staff can queue emails" ON public.email_queue;
DROP POLICY IF EXISTS "Managers can update email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Managers can delete from email queue" ON public.email_queue;

-- SELECT: All org members can view
CREATE POLICY "View email queue"
ON public.email_queue FOR SELECT
TO authenticated
USING (public.user_has_organization_access(organization_id));

-- INSERT: Staff+ only (can queue emails)
CREATE POLICY "Staff queue emails"
ON public.email_queue FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_organization_access(organization_id)
  AND public.user_has_role_at_least(auth.uid(), organization_id, 'staff')
);

-- UPDATE: Manager+ only (can edit/manage queue)
CREATE POLICY "Managers update email queue"
ON public.email_queue FOR UPDATE
TO authenticated
USING (
  public.user_has_organization_access(organization_id)
  AND public.user_has_role_at_least(auth.uid(), organization_id, 'manager')
)
WITH CHECK (
  public.user_has_organization_access(organization_id)
  AND public.user_has_role_at_least(auth.uid(), organization_id, 'manager')
);

-- DELETE: Manager+ only
CREATE POLICY "Managers delete email queue"
ON public.email_queue FOR DELETE
TO authenticated
USING (
  public.user_has_organization_access(organization_id)
  AND public.user_has_role_at_least(auth.uid(), organization_id, 'manager')
);

-- ============================================================================
-- PART 6: Fix RLS policies for ledger_entries
-- ============================================================================

DROP POLICY IF EXISTS "Users can view ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Users can insert ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Users can update ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Users can delete ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Org members can view ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Managers can post ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Admins can update ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Admins can delete ledger entries" ON public.ledger_entries;

-- SELECT: All org members can view
CREATE POLICY "View ledger entries"
ON public.ledger_entries FOR SELECT
TO authenticated
USING (public.user_has_organization_access(organization_id));

-- INSERT: Manager+ only (posting to ledger is significant)
CREATE POLICY "Managers post ledger entries"
ON public.ledger_entries FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_organization_access(organization_id)
  AND public.user_has_role_at_least(auth.uid(), organization_id, 'manager')
);

-- UPDATE: Admin+ only (ledger entries should rarely be modified)
CREATE POLICY "Admins update ledger entries"
ON public.ledger_entries FOR UPDATE
TO authenticated
USING (
  public.user_has_organization_access(organization_id)
  AND public.user_has_role_at_least(auth.uid(), organization_id, 'admin')
)
WITH CHECK (
  public.user_has_organization_access(organization_id)
  AND public.user_has_role_at_least(auth.uid(), organization_id, 'admin')
);

-- DELETE: Admin+ only
CREATE POLICY "Admins delete ledger entries"
ON public.ledger_entries FOR DELETE
TO authenticated
USING (
  public.user_has_organization_access(organization_id)
  AND public.user_has_role_at_least(auth.uid(), organization_id, 'admin')
);

-- ============================================================================
-- PART 7: Fix RLS policies for journals
-- ============================================================================

DROP POLICY IF EXISTS "Users can view journals" ON public.journals;
DROP POLICY IF EXISTS "Users can create journals" ON public.journals;
DROP POLICY IF EXISTS "Users can update journals" ON public.journals;
DROP POLICY IF EXISTS "Users can delete journals" ON public.journals;
DROP POLICY IF EXISTS "Org members can view journals" ON public.journals;
DROP POLICY IF EXISTS "Managers can create journals" ON public.journals;
DROP POLICY IF EXISTS "Admins can update journals" ON public.journals;
DROP POLICY IF EXISTS "Admins can delete journals" ON public.journals;

-- SELECT: All org members can view
CREATE POLICY "View journals"
ON public.journals FOR SELECT
TO authenticated
USING (public.user_has_organization_access(organization_id));

-- INSERT: Manager+ only
CREATE POLICY "Managers create journals"
ON public.journals FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_organization_access(organization_id)
  AND public.user_has_role_at_least(auth.uid(), organization_id, 'manager')
);

-- UPDATE: Admin+ only
CREATE POLICY "Admins update journals"
ON public.journals FOR UPDATE
TO authenticated
USING (
  public.user_has_organization_access(organization_id)
  AND public.user_has_role_at_least(auth.uid(), organization_id, 'admin')
)
WITH CHECK (
  public.user_has_organization_access(organization_id)
  AND public.user_has_role_at_least(auth.uid(), organization_id, 'admin')
);

-- DELETE: Admin+ only
CREATE POLICY "Admins delete journals"
ON public.journals FOR DELETE
TO authenticated
USING (
  public.user_has_organization_access(organization_id)
  AND public.user_has_role_at_least(auth.uid(), organization_id, 'admin')
);