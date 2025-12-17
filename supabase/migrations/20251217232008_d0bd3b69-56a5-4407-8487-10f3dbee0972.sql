-- ===========================================
-- FINAL RLS POLICY CLEANUP - Remove ALL duplicates
-- ===========================================

-- ============ BILLS - Drop ALL, recreate canonical ============
DROP POLICY IF EXISTS "Admins delete draft bills" ON bills;
DROP POLICY IF EXISTS "Users can delete bills in their organization" ON bills;
DROP POLICY IF EXISTS "bills_delete_rpc_only" ON bills;
DROP POLICY IF EXISTS "bills_delete_via_rpc" ON bills;
DROP POLICY IF EXISTS "Staff create bills" ON bills;
DROP POLICY IF EXISTS "Users can insert bills in their organization" ON bills;
DROP POLICY IF EXISTS "bills_insert_rpc_only" ON bills;
DROP POLICY IF EXISTS "bills_insert_via_rpc" ON bills;
DROP POLICY IF EXISTS "Users can view bills in their organization" ON bills;
DROP POLICY IF EXISTS "View bills" ON bills;
DROP POLICY IF EXISTS "Staff update draft bills" ON bills;
DROP POLICY IF EXISTS "Users can update bills in their organization" ON bills;
DROP POLICY IF EXISTS "bills_update_rpc_only" ON bills;
DROP POLICY IF EXISTS "bills_update_via_rpc" ON bills;

-- ============ BILL_LINES - Drop ALL legacy ============
DROP POLICY IF EXISTS "Users can view bill lines via bills" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_delete_via_rpc" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_update_via_rpc" ON bill_lines;

-- ============ BILL_PAYMENTS - Drop ALL legacy ============
DROP POLICY IF EXISTS "Users can delete bill payments via bills" ON bill_payments;
DROP POLICY IF EXISTS "bill_payments_no_direct_delete" ON bill_payments;
DROP POLICY IF EXISTS "Users can insert bill payments via bills" ON bill_payments;
DROP POLICY IF EXISTS "bill_payments_no_direct_insert" ON bill_payments;
DROP POLICY IF EXISTS "Users can view bill payments via bills" ON bill_payments;
DROP POLICY IF EXISTS "Users can update bill payments via bills" ON bill_payments;
DROP POLICY IF EXISTS "bill_payments_no_direct_update" ON bill_payments;

-- ============ EMAIL_QUEUE - Drop ALL legacy ============
DROP POLICY IF EXISTS "Managers delete email queue" ON email_queue;
DROP POLICY IF EXISTS "Users can delete email queue in their organization" ON email_queue;
DROP POLICY IF EXISTS "email_queue_delete_rpc_only" ON email_queue;
DROP POLICY IF EXISTS "Staff queue emails" ON email_queue;
DROP POLICY IF EXISTS "Users can insert email queue in their organization" ON email_queue;
DROP POLICY IF EXISTS "email_queue_insert_rpc_only" ON email_queue;
DROP POLICY IF EXISTS "email_queue_insert_via_rpc" ON email_queue;
DROP POLICY IF EXISTS "Users can view email queue in their organization" ON email_queue;
DROP POLICY IF EXISTS "View email queue" ON email_queue;
DROP POLICY IF EXISTS "Managers update email queue" ON email_queue;
DROP POLICY IF EXISTS "Users can update email queue in their organization" ON email_queue;
DROP POLICY IF EXISTS "email_queue_update_rpc_only" ON email_queue;
DROP POLICY IF EXISTS "email_queue_update_via_rpc" ON email_queue;

-- ============ INVOICE_LINES - Drop legacy ============
DROP POLICY IF EXISTS "Portal clients can view their invoice lines" ON invoice_lines;

-- ============ INVOICE_PAYMENTS - Drop ALL legacy ============
DROP POLICY IF EXISTS "Admins delete invoice payments" ON invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_no_direct_delete" ON invoice_payments;
DROP POLICY IF EXISTS "Managers record invoice payments" ON invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_no_direct_insert" ON invoice_payments;
DROP POLICY IF EXISTS "View invoice payments" ON invoice_payments;
DROP POLICY IF EXISTS "Managers update invoice payments" ON invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_no_direct_update" ON invoice_payments;

-- ============ INVOICES - Drop ALL legacy ============
DROP POLICY IF EXISTS "Portal clients can view their invoices" ON invoices;
DROP POLICY IF EXISTS "Admins delete invoices" ON invoices;
DROP POLICY IF EXISTS "Staff create invoices" ON invoices;
DROP POLICY IF EXISTS "View invoices" ON invoices;
DROP POLICY IF EXISTS "Staff update invoices" ON invoices;