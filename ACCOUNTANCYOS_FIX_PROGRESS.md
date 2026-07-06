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

## Fix 3 — Gate bank-connect + sync + stripe-checkout + mailbox/HMRC workers (SEC-4, SEC-8) — ✅ DONE (commit 9d3609e)

**Acceptance tests:** cross-entity/cross-org bank connect or sync → 403; anonymous call to a cron worker → 401; legit accountant/portal/cron paths still work.

**What changed:**
- `truelayer-auth`: dropped the trusted body `organization_id`; always derive the entity's true org and authorize the caller against the entity — `portal_user_has_entity_access` (portal) or `user_in_organization` (accountant). Closes: any authed user attaching a bank connection to any entity.
- `truelayer-sync`: authorize the caller against the resolved connection (org member OR portal user with entity access) before syncing — fixes the body-id IDOR. Scheduled sync is a separate service-role fn, unaffected.
- `stripe-checkout`: added `getUser` (was none despite verify_jwt) + membership check on the body `organizationId`.
- `gmail-sync`/`outlook-sync`/`hmrc-ct-poll`/`hmrc-ct-delete`: `verify_jwt=false` internal workers → require `bearer === SERVICE_ROLE_KEY` (mirrors `gmail-send`). Verified the cron sends the service-role bearer (`20251203124749`) and none is called from the frontend.

**Files:** `supabase/functions/{truelayer-auth,truelayer-sync,stripe-checkout,gmail-sync,outlook-sync,hmrc-ct-poll,hmrc-ct-delete}/index.ts`.

**Checks:** brace-balance OK on all 7; `build` ✅; `vitest` ✅ 140/140. 401/403 runtime — *owner-verify* after deploy.

**Remaining risk:** used explicit-user RPC helpers because these run on the service-role key (`auth.uid()` is null). `truelayer-auth` still permits the accountant surface to connect (org member) — closing the cross-tenant hole; whether accountants *should* connect at all is a product-policy choice, not a security gap. `hmrc-ct-poll/delete` are still unscheduled (Fix 9 schedules them).

---

## Fix 4 — Multi-org context + portal visibility + anon token (SEC-5, SEC-6, SEC-7) — ⚠️ PARTIAL (commit 41b71a8)

**SEC-5 ✅ DONE (migration 20260706103035):** the `organization_users` "view members" policy used `organization_id = get_user_organization_id()` (LIMIT-1 arbitrary org). Replaced with `user_in_organization(auth.uid(), organization_id)` (SECURITY DEFINER, recursion-safe, multi-org correct). Investigation correction: the audit's "cross-tenant P0" was an over-read — the single live usage *under*-returns for multi-org users (a correctness bug), not a leak. No other RLS usage of the function exists. *owner-verify* after apply.

**SEC-6 ⏸️ DEFERRED (needs live-policy visibility):** the 8 portal SELECT policies ignoring `show_*` flags can't be safely fixed blind. There are **overlapping** portal policies per table — the named ones (`20251129230654`) *plus* blanket "Portal bookkeeping full access" policies created via dynamic SQL in `20260605122942`. RLS is permissive-OR, so tightening one leaves the blanket one granting access; a correct fix must reconcile ALL policies against the LIVE set (diverges from git) and confirm a helper maps `show_*`. It's P1 **visibility-contract** (NOT cross-tenant — portal membership to the entity is still required). Do with live-DB access.

**SEC-7 ⏸️ DEFERRED (would break legacy onboarding):** requiring the onboarding token unconditionally breaks every **legacy** link — `PublicOnboarding.tsx:35-50` documents that legacy links carry no token and the RPCs treat NULL as "no token". The IDOR needs a guessed 122-bit application UUID (P1, low-exploitability). Prerequisite: thread tokens into legacy links (or confirm none remain), then flip enforcement.

---

## Phase 1 (security) status: SEC-1..SEC-5 shipped; SEC-6/SEC-7 need live access/prereqs.

## Fix 5 — Portal invite (FUN-1) — ✅ DONE (commit bf8de2c)
**Acceptance:** fresh invite → set password → dashboard with entities; reused/expired token → friendly message; not a login loop.
**What changed:** PortalInvite treated the signup fn's success statuses (`created`/`already_exists`) as errors and never called `lifecycle_accept_portal_invitation` (the only path that activates `portal_access`) → guard looped every invited user to login. Now: accept those statuses; friendly `invalid_token` message; sign in with the fn-returned email (fixes typo trap); call `lifecycle_accept_portal_invitation(p_token)` before navigating. `accept-portal-invite-signup` returns the email on success. `PortalGuard`: authenticated-but-no-access shows an explicit screen + sign-out (was a login loop, F-06).
**Files:** `src/portal/pages/PortalInvite.tsx`, `src/portal/guards/PortalGuard.tsx`, `supabase/functions/accept-portal-invite-signup/index.ts`.
**Checks:** build ✅, vitest ✅ 140/140, braces OK. Redeploy `accept-portal-invite-signup`. Full flow is *owner-verify* (needs a real invite + live DB).

## Fix 10 — Email-queue idempotency + atomic worker claim (FUN-4) — ✅ DONE (commit d35bc2a)
**Acceptance:** duplicate producer call / worker retry does not produce a second send; separate scheduled chasers + deliberate resends still send.
**What changed (additive, no lifecycle changes):**
- Migration `20260706144830`: `email_queue.claimed_at` + unique index on `idempotency_key` (NULLs distinct → unkeyed rows unaffected) + pending-claim index.
- `process-email-queue`: reclaim-aware select (skip claimed rows; recover claims stale >10m) + atomic claim (`UPDATE … WHERE status='pending' AND claim-free RETURNING`) before send. Existing per-row send/retry semantics untouched.
- Producers keyed + `upsert(onConflict,ignoreDuplicates)`: `send-invoice`, `send-engagement-letter` (date-bucketed — dedup same-day double-send, allow later resend); `chaser-tick` (per-occurrence key — retry dedups, distinct chasers preserved); `email-service.queueEmail` gains optional `idempotencyKey`.
- `src/lib/email-idempotency.ts` + 9 tests pin the key contract.
**Files:** migration `20260706144830`; edge `process-email-queue`,`send-invoice`,`send-engagement-letter`,`chaser-tick`; `src/lib/email-service.ts`,`src/lib/email-idempotency.ts`,`src/test/regression/email-idempotency.test.ts`.
**Checks:** tsc 0 errors, build ✅, vitest ✅ 149/149 (9 new). Runtime dedup/claim behaviour is *owner-verify* (needs live DB).
**Residual risk:** (1) apply migration BEFORE the worker deploy (the claim select references `claimed_at`). (2) The `email_queue`↔PGMQ bridge is not in git (likely Lovable-side / divergence) — the fix targets the `email_queue`-drain path the worker actually runs; if a live producer enqueues PGMQ directly, that path is out of scope. (3) `send-engagement-letter` already used `context:'engagement'` which isn't in the context CHECK — pre-existing, left as-is. (4) Failed `email_queue` rows follow existing (no auto-retry) semantics — unchanged by design.

## Fix 6 — Filing "mark as filed" gate (FIL-2) — ✅ DONE (commit f7cb0c0); FIL-1 structural gate DEFERRED
**Acceptance:** a draft/manual filing can't be flipped to filed without a reference; an already-submitted filing still can; audit records manual-vs-real.
**What changed (frontend/service only):** `markFilingAsFiled` now gates via pure `evaluateMarkFiled(status, ref)` — allowed only if status submitted/accepted OR a non-empty reference is supplied (blocks the silent empty/fabricated-reference flip). Audit metadata gains `manual_filing` + `prior_status`. `JobFilingTab`'s non-CH "Mark as Filed" now requires a reference input (was passing none). 5 tests.
**Files:** `src/lib/filing-mark-filed-gate.ts` (new, pure), `src/lib/filing-service.ts`, `src/components/jobs/JobFilingTab.tsx`, `src/test/regression/filing-mark-filed-gate.test.ts`.
**Checks:** tsc 0, build ✅, vitest 154/154 (5 new). Frontend-only — ships with app build.
**FIL-1 DEFERRED (same trap as SEC-7/Fix 8):** the structural gate (require `filing_approvals` + `model_snapshot_id`) is NOT enforced — `createFilingApproval` has no callers and `model_snapshot_id` is unpopulated, so enforcing it blind would block ALL filing. Prereq: wire approval creation + snapshot population into the filing flow, then add a DB trigger. Staged effort.

## FUN-5 — Portal action completeness — ✅ DONE (3 of 4, commit e5a8839)
Receipt upload (migration `20260706153650`: portal storage INSERT policy on `receipts`), portal Tasks "Mark done" action, and `send-invoice` send-authorization (org member OR `allow_invoice_send`). tsc 0 / build / 154 tests. Apply `20260706153650`; redeploy `send-invoice`. **DEFERRED:** portal document upload (table policy exists, but needs a storage-bucket policy + upload UI + job linkage — follow-up).

## Security/integrity fixes shipped: SEC-1..SEC-5, FUN-1 (portal invite), FUN-4 (email idempotency), FIL-2 (filing gate), FUN-5 (portal actions).
## Parked/deferred (need live access or staged rollout + owner decisions): SEC-6, SEC-7, Fix 8 (LC-1/2/3 lifecycle), FIL-1 (filing structural gate).
## Remaining unstarted P0/P1 that ARE shippable: FUN-2 (schedule automation cluster — but needs live cron verification), FUN-3 (engagement-letter sign link), FUN-5 (portal actions: receipt upload policy, tasks, doc upload), FUN-6 (CH profile + service assignment + orphan cleanup).
