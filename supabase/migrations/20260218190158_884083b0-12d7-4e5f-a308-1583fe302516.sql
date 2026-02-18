
-- ============================================================
-- FIX REMAINING RLS GAPS FROM ADVERSARIAL AUDIT
-- Fixes: F3 (journals direct INSERT), F10 (snapshots immutability),
--        ledger_entries ALL policy bypass
-- ============================================================

-- ============================================================
-- 1. LEDGER_ENTRIES: Remove the ALL policy that overrides everything
--    Keep only SELECT policies. INSERT/UPDATE/DELETE forced through post_to_ledger RPC.
-- ============================================================

DROP POLICY IF EXISTS "Users can manage ledger entries in their organization" ON public.ledger_entries;
DROP POLICY IF EXISTS "ledger_entries_no_direct_insert" ON public.ledger_entries;
DROP POLICY IF EXISTS "ledger_entries_no_direct_update" ON public.ledger_entries;
DROP POLICY IF EXISTS "ledger_entries_no_direct_delete" ON public.ledger_entries;
DROP POLICY IF EXISTS "Managers post ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Admins update ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Admins delete ledger entries" ON public.ledger_entries;

-- Only SELECT remains (org members + portal clients)
-- INSERT/UPDATE/DELETE only possible via post_to_ledger RPC (SECURITY DEFINER)

-- ============================================================
-- 2. JOURNALS: Remove direct INSERT policy
--    Keep SELECT for org members. INSERT/UPDATE/DELETE only via RPC.
-- ============================================================

DROP POLICY IF EXISTS "Managers create journals" ON public.journals;
DROP POLICY IF EXISTS "Admins update journals" ON public.journals;
DROP POLICY IF EXISTS "Admins delete journals" ON public.journals;

-- Only SELECT remains. All writes go through post_to_ledger RPC (SECURITY DEFINER).

-- ============================================================
-- 3. FILING_MODEL_SNAPSHOTS: Add immutability (no UPDATE/DELETE)
-- ============================================================

CREATE POLICY "Snapshots are immutable - no updates" ON public.filing_model_snapshots
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "Snapshots are immutable - no deletes" ON public.filing_model_snapshots
  FOR DELETE TO authenticated
  USING (false);
