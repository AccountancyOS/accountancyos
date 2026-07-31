-- =====================================================================================
-- ROLLBACK for 20260731210000_def_001_002_rpc_context_and_invoice_draft.sql
-- =====================================================================================
-- NOT a migration. Kept outside supabase/migrations/ so it is never applied by accident.
-- Run only to reverse that release.
--
-- !! WARNING — ROLLING BACK RESTORES BROKEN AND WEAKER BEHAVIOUR !!
--   * The eight repaired functions go back to calling public.set_rpc_context(), which
--     does not exist. Every call aborts with 42883 again: bill approval, bill voiding,
--     supplier payments, customer creation and all four automation-rule operations.
--   * The invoice-draft overloads return, and with them PostgREST's PGRST203 ambiguity:
--     the service's 9-key update payload matches neither candidate.
--   * The relationship checks are lost. A restored create no longer verifies that the
--     entity belongs to the organisation, and neither restored function verifies that a
--     supplied customer belongs to the invoice's organisation — cross-tenant attachment
--     becomes possible again.
--   * PUBLIC and anon EXECUTE are restored on privileged mutating functions.
--   * The create overloads' security divergence returns (one authorises portal clients,
--     the other requires can_create_invoices).
-- Prefer fixing forward.
--
-- Order is dependency-safe: recreate superseded signatures first, then restore the eight
-- bodies, then restore ACLs last so nothing is briefly reachable under the wrong grants.
-- =====================================================================================

-- ── 1. Recreate the superseded invoice-draft signatures ──────────────────────────────
-- Restore from the pre-migration live definitions:
--   create_invoice_draft_safe 13-arg  a7b18cc622c91c4e883c93258951c102
--   update_invoice_draft_safe 8-arg   11aa2e7d6a034758f23737791378c36e
--   update_invoice_draft_safe 8-arg   bf0ea670da8f4adcabac6d6b624e5624
-- Their full bodies are recorded in docs/audits/2026-07-31-def-001-002-signature-matrix.md
-- and are reproduced from that record rather than retyped here, so the rollback cannot
-- drift from what was actually replaced. Paste them in ABOVE the drop below.
--
--   >>> OPERATOR STEP: recreate those three functions from the recorded bodies before
--   >>> running the DROP that follows, or the operation will be unavailable.

-- ── 2. Remove the new canonical 9-argument update ────────────────────────────────────
-- Safe only once the two 8-arg signatures above exist again, otherwise the service's
-- update payload resolves to nothing.
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(
  uuid, uuid, text, text, text, text, text, text, jsonb);

-- ── 3. Restore the eight function bodies to their pre-repair state ───────────────────
-- Each is identical to the version shipped in 20260731210000 EXCEPT that
--   PERFORM set_config('app.rpc', '1', true);
-- reverts to
--   PERFORM public.set_rpc_context();
-- Reproduce each from the migration and make that single substitution. Hashes to restore:
--   create_automation_rule_safe   de32451bf09a51a6742ead9f4d9370c7
--   update_automation_rule_safe   3803ae13cc8175a520b966e8e580c792
--   toggle_automation_rule_safe   dbe752a548473094290ba330a37bd499
--   delete_automation_rule_safe   1ef6b7fc5ca1ae64dda5bfc86e606658
--   approve_bill_safe             755513149768024ecce6dfa2c5824dd7
--   void_bill_safe                cc7973c4e90325f0a37e5921e048adcc
--   record_bill_payment_safe      2dbb017119696ef2f1569c384e08445b
--   create_customer_safe          1ca6a433362aae7a5d027275b91a57bd
--
--   >>> OPERATOR STEP: these restore a call to a function that does not exist. Only do
--   >>> this if the intent really is to reinstate the outage.

-- ── 4. Restore ownership and ACLs exactly as inventoried on 2026-07-31 ───────────────
-- Pre-migration ACL on every affected signature:
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,
--    service_role=X/postgres,sandbox_exec=X/postgres}
DO $$
DECLARE
  v_sig text;
  v_sigs text[] := ARRAY[
    'public.create_automation_rule_safe(uuid,text,text,jsonb,text,jsonb,boolean,text)',
    'public.update_automation_rule_safe(uuid,text,text,jsonb,text,jsonb,boolean,text)',
    'public.toggle_automation_rule_safe(uuid,boolean)',
    'public.delete_automation_rule_safe(uuid)',
    'public.approve_bill_safe(uuid)',
    'public.void_bill_safe(uuid,text)',
    'public.record_bill_payment_safe(uuid,numeric,date,uuid,text,text)',
    'public.create_customer_safe(uuid,text,uuid,text,text,text,jsonb,text,text,integer,text,text)',
    'public.create_invoice_draft_safe(uuid,text,uuid,text,uuid,text,text,text,date,date,text,text,jsonb)',
    'public.create_invoice_draft_safe(uuid,text,uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb)',
    'public.update_invoice_draft_safe(uuid,uuid,text,text,date,date,text,jsonb)',
    'public.update_invoice_draft_safe(uuid,uuid,text,text,text,text,text,jsonb)'
  ];
BEGIN
  FOREACH v_sig IN ARRAY v_sigs LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', v_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon, authenticated, service_role, sandbox_exec', v_sig);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Skipped (not present): %', v_sig;
    END;
  END LOOP;
END $$;
