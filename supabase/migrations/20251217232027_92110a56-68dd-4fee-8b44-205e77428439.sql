-- Final cleanup of remaining duplicates
DROP POLICY IF EXISTS "invoices_delete_via_rpc" ON invoices;
DROP POLICY IF EXISTS "invoices_insert_via_rpc" ON invoices;
DROP POLICY IF EXISTS "invoices_update_via_rpc" ON invoices;
DROP POLICY IF EXISTS "Portal clients view their invoices" ON invoices;
DROP POLICY IF EXISTS "Users can view invoices in their organization" ON invoices;

DROP POLICY IF EXISTS "Users can view invoice payments in their organization" ON invoice_payments;
DROP POLICY IF EXISTS "Admins update invoice payments" ON invoice_payments;