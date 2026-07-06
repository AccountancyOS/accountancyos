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

## Fix 2 — Authenticate the filing submitters + PDF (SEC-2, SEC-3) — ✅ DONE (commit 5fdbe2a)

**Acceptance tests:** body-id call without org membership → 401/403; only own-org filings submit; PDF requires valid token + org match, served via signed URL not public URL.

**What changed:** `hmrc-ct-submit`, `cis-submit`, `rti-submit`, `generate-filing-pdf` ran on the service-role key with no real auth (verify_jwt accepts the anon key). Added, mirroring the `ch-submit` reference: `auth.getUser(token)` (401 if invalid) + an `organization_users` membership check against the **filing's own** `organization_id` (403), derived from the verified filing not the body. cis/rti also reject `body.organizationId != filing.organization_id`. `generate-filing-pdf` additionally: token was presence-only → now validated; `getPublicUrl` → `createSignedUrl(…, 1h)` (+ downstream `publicUrl`→`signedUrl`).

**Files:** `supabase/functions/{hmrc-ct-submit,cis-submit,rti-submit,generate-filing-pdf}/index.ts`.

**Checks:** brace-balance OK on all 4; `build` ✅; `vitest` ✅ 140/140. Runtime 401/403 behaviour is edge-runtime — *owner-verify* after deploy.

**Remaining risk:** legit callers (payroll/CIS provider, PDF-from-app) invoke with the user session → pass; `hmrc-ct-submit` has no UI caller yet (wired in Fix 7). The anon key has no `sub`, so `getUser(anonKey)` → no user → 401 (the intended defense) — confirm on deploy. `filing-documents` bucket privacy unverified (signed URL works either way).

---

## Next: Fix 3 — Gate bank-connect + sync + stripe-checkout + mailbox sync (SEC-4, SEC-8)
`truelayer-auth` (connect path: check `portal_has_perm('allow_bank_connect')`/`user_in_organization` for the entity before issuing state), `truelayer-sync` (IDOR: org-match the bank_account/connection), `stripe-checkout` (requireOrgContext, don't trust body org), `gmail-sync`/`outlook-sync` + `hmrc-ct-poll`/`hmrc-ct-delete` (require `SERVICE_ROLE_KEY`/`CRON_SECRET`).
