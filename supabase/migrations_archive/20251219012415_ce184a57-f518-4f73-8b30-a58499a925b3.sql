-- ============================================================
-- Final cleanup: Remove ALL remaining {public} policies on invoices
-- ============================================================

DROP POLICY IF EXISTS "invoices_delete_rpc" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_rpc" ON public.invoices;
DROP POLICY IF EXISTS "invoices_select_org" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_rpc" ON public.invoices;