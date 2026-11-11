-- ============================================================
-- Cleanup: Remove remaining {public} policies on leads and invoices
-- ============================================================

-- Leads: Drop the legacy {public} policies we missed
DROP POLICY IF EXISTS "Users can delete leads in their organization" ON public.leads;
DROP POLICY IF EXISTS "Users can insert leads in their organization" ON public.leads;
DROP POLICY IF EXISTS "Users can update leads in their organization" ON public.leads;

-- Invoices: Drop any legacy {public} policies
DROP POLICY IF EXISTS "Users can delete invoices in their organization" ON public.invoices;
DROP POLICY IF EXISTS "Users can insert invoices in their organization" ON public.invoices;
DROP POLICY IF EXISTS "Users can update invoices in their organization" ON public.invoices;
DROP POLICY IF EXISTS "Users can view invoices in their organization" ON public.invoices;