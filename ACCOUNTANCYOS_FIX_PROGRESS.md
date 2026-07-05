# AccountancyOS Audit — Fix Progress

Execution backlog from `ACCOUNTANCYOS_FULL_CODE_AUDIT.md`, in strict priority order. One fix at a time; no bundling. DB changes are additive migrations that require owner apply (I have no live-DB access — acceptance tests that need a running DB are marked *owner-verify*).

---

## Fix 1 — Close the raw ledger-RPC authz bypass (SEC-1) — ✅ DONE (commit 7de5b14)

**Acceptance tests (restated):** (1) org-A member raw-calls on an org-B invoice/journal → `not_authorized`, nothing written; (2) `created_by` = `auth.uid()` regardless of `p_user_id`; (3) `record_invoice_payment_safe`, Stripe verify (service role), `apply_bank_match` still work.

**What changed:** Added an internal tenant guard to the 5 raw `SECURITY DEFINER` ledger functions (`record_invoice_payment`, `record_bill_payment`, `void_invoice`, `void_bill`, `reverse_journal`): `IF NOT (auth.role()='service_role' OR user_in_organization(auth.uid(), <row org>)) THEN RETURN not_authorized`. Payment/void functions also force `v_uid := auth.uid()` for non-service callers (kills `p_user_id` spoofing). Chose in-function guards over REVOKE because the accountant UI calls the raw functions directly (`invoice-service.ts:226/245`, `bills-service.ts:216/235`, `ReverseJournalDialog.tsx:93`) and `reverse_journal` has no `_safe` wrapper — REVOKE would break live flows. Bodies reproduced byte-faithfully; grants preserved by `CREATE OR REPLACE`.

**Files changed:** `supabase/migrations/20260705120000_5ec10001-…sql` (new).

**Checks run:** `npm run build` ✅ · `npx vitest run` ✅ 140/140. (SQL-only; no TS surface change.) Cross-tenant rejection + `created_by` behaviour are DB-runtime — *owner-verify* after apply.

**Result:** Raw ledger functions now authorize internally regardless of entry door; portal-exposed "Record Payment" (SalesTab) can no longer post cross-tenant.

**Remaining risk:** Acceptance tests 1–2 need a live DB to prove (owner apply of `20260705120000`, then a cross-org rpc probe). `auth.role()` reflects the caller inside `SECURITY DEFINER` (consistent with 14 existing usages) — verified by pattern, not runtime.

---

## Next: Fix 2 — Authenticate the filing submitters + PDF (SEC-2, SEC-3)
Edge functions `hmrc-ct-submit`, `cis-submit`, `rti-submit`, `generate-filing-pdf` — adopt `_shared/auth.ts requireOrgContext`, derive org from the verified filing (never the body), private bucket + signed URLs for the PDF.
