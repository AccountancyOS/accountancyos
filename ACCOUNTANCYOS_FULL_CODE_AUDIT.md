# AccountancyOS Full Code Audit

**Date:** 2026-07-05 · **Repo state:** commit `3d4b0eb`, branch `main` · **Scale:** 358 migrations, 59 edge functions, 59 pages, 48 portal files.
**Method:** 7 parallel domain auditors (lifecycle, DB/RLS/security, edge functions, accountant journeys, portal journeys, frontend/dead-code, stress/filing) tracing frontend→RPC→RLS→edge→state, plus static checks (typecheck/lint/build/test). Findings cross-reconciled and de-duplicated.
**Hard caveat (applies to every finding):** I have **no live-DB access**, and the live Lovable deployment is known to diverge from git (unapplied migrations + Lovable-side code not in git). All SQL/code evidence is **proven from the repo**; live behaviour may differ. Items needing live verification are marked *(verify live)*.

---

## 1. Executive Summary

**Classification: RUNNABLE BUT NOT WORKFLOW-SAFE.**

The app builds, typechecks, and passes its 140-test suite; the core CRUD spine (lead → quote → accept → onboard → client → jobs → deadlines → documents → workpapers → email → questionnaires) is genuinely durable and mostly RPC-gated — better than it looks from outside. But it cannot be given to real practices or their clients yet, for five structural reasons:

1. **Cross-tenant financial write holes.** Raw `SECURITY DEFINER` ledger functions (`record_invoice_payment`, `void_invoice`, `reverse_journal`, …) are granted to `authenticated`, callable directly via PostgREST, with **no internal org check** and a **caller-supplied `p_user_id`**. Any authenticated user (including any portal client) can post/void/reverse journals in **any** organisation. The `*_safe` wrappers enforce authz but are not the only door.
2. **Unauthenticated statutory filing + PII exposure.** `hmrc-ct-submit`, `cis-submit`, `rti-submit` trust a request-body `filingId`/`organizationId` with no auth — anyone holding the anon key (shipped in the frontend bundle) can file real returns / forge filing state cross-tenant. `generate-filing-pdf` never validates its token and writes client UTR/NI PII to a **public** bucket URL.
3. **Filing is fake or absent on every wired path.** The "no submission without an approved model version" invariant mandated by `docs/accountancyos-filing-engine-spec-v2.md` is **100% dead code**. VAT "Submit" is a local status flip; CT600's real transport has no UI; RTI/CIS auto-mark `filed` on *simulated* acceptance with faked IRmarks; `markFilingAsFiled` is an unguarded universal bypass. A practice can believe filings were submitted when HMRC has nothing.
4. **The client portal is not enterable.** The invite flow is broken end-to-end (`accept-portal-invite-signup` returns statuses the UI treats as errors, and `lifecycle_accept_portal_invitation` — the only code that activates portal access — is never called). No new client can get in.
5. **Automation never runs, and the lifecycle duplicates jobs.** The chaser/workflow/scan cluster has **no cron schedule** in any migration (confirmed by two auditors). Meanwhile quote-acceptance and onboarding-approval **both** materialise jobs, colliding on a mutable `period_label`, producing duplicate jobs and garbage "Setup Pending" statutory deadlines on the normal path.

**The cross-cutting root cause** (proven across security, filing, email, idempotency): *the correct safety mechanisms exist but are unwired, and the unsafe paths are the wired ones.* A shared `requireOrgContext` auth helper, an `idempotency_keys` table, `_shared/idempotency.ts`, `filing_approvals` + validation RPCs, `filing-snapshot-service`, and the real HMRC transports are all present with **zero callers**. Remediation is therefore mostly **wiring and gating, not new construction** — which matches the additive-migration workflow this project already uses.

**What's genuinely good** (keep as reference patterns): `apply_bank_match` (fully tenant-checked), `create/update/issue_invoice_draft_safe`, `stripe-webhook` (signature + event dedup), `truelayer-sync-scheduled` (`x-cron-secret`), `auth-email-hook` (HMAC), `accept-portal-invite-signup`'s server-side token validation, `generate-invoice-pdf` (RLS end-to-end), the per-entity React-Query keys, per-tab ErrorBoundaries, and the honestly-good success-toast discipline (no toast-before-durable-write instances found).

---

## 2. Critical Findings

Severity key: **P0** release-blocking · **P1** blocks client-ready · **P2** workflow hardening · **P3** polish. "Blocks" = blocks client-ready release.

### Security / tenant isolation

**SEC-1 · P0 · Invoicing/ledger RPC · Security risk · Blocks: Y**
*Evidence:* raw `record_invoice_payment`/`record_bill_payment` (`20260703215530…:18-186/188-354`), `void_invoice`/`void_bill` (`20260704090000…:15-93/95-173`), `reverse_journal` (`20260703213012…:11-185`) are all `SECURITY DEFINER`, gated only on `is_posted`/`status`, with **no `user_in_organization`/`portal_has_perm`** and actor `v_uid := COALESCE(p_user_id, auth.uid())`. Granted to `authenticated` explicitly (`20260608145054:373,588`) and by blanket `GRANT EXECUTE ON ALL FUNCTIONS … TO authenticated` (`20260703211752:26`).
*What breaks:* any authenticated user (staff of another org, or any portal client) `POST /rest/v1/rpc/record_invoice_payment` (or void/reverse) with a victim-org id → posts/voids/reverses real journals in the victim's ledger, attributed to a spoofed UUID. Cross-tenant books corruption + audit forgery. Surfaced in-product by the portal Sales-tab "Record Payment" button (`SalesTab.tsx:301`).
*Root cause:* defense-in-depth placed only in `*_safe` wrappers; raw definer functions left world-executable. (My own recent B2/E1/B4 fixes reproduced the bodies byte-faithfully, preserving the missing check; the blanket grant re-exposed them.)
*Fix:* add `IF NOT public.user_in_organization(auth.uid(), v_invoice.organization_id) THEN RAISE …` to each raw body; force `v_uid := auth.uid()` (or restrict `p_user_id` to `service_role`); **or** `REVOKE EXECUTE … FROM authenticated, PUBLIC` and route solely through `*_safe`.
*Acceptance:* as org-A member, raw call on org-B invoice/journal → `not_authorized`, nothing written; `created_by` always = `auth.uid()`.

**SEC-2 · P0 · Edge/filing · Missing-auth · Blocks: Y**
*Evidence:* `hmrc-ct-submit/index.ts:737-757` — service-role client, `const {filingId, environment='test'} = await req.json()`, loads filing by body id, **no `getUser`/org check** in 1228 lines (contrast `ch-submit:112-125`). `cis-submit/index.ts:25-41` and `rti-submit/index.ts:26-41` identical, trusting body `filingId`+`organizationId`.
*What breaks:* anyone with the anon key POSTs `{filingId:"<victim-uuid>", environment:"production"}` → irreversible statutory CT600 filed for another firm's client (CT path is real HMRC transport); CIS/RTI mark any org's filing `filed`/forge receipt refs cross-tenant.
*Fix:* `requireOrgContext(req,{permission:'filings.submit'})` (the helper exists in `_shared/auth.ts:103`); derive org from the verified filing, never the body; server-validate `environment`.
*Acceptance:* body-id call without membership → 403; only approved own-org filings submit.

**SEC-3 · P0 · Edge/filing · Missing-auth + PII · Blocks: Y**
*Evidence:* `generate-filing-pdf/index.ts:33-39` checks only that an `Authorization` header **exists** (`getUser` never called); `:52-65` loads filing + `clients(first_name,last_name,utr,national_insurance_number)` by body id via service role; output to a **public** bucket URL.
*What breaks:* any non-empty `Authorization` value → full tax-return/UTR/NI for any filing + a durable public link.
*Fix:* validate token via `getUser()`, assert `filing.organization_id === orgId`, private bucket + signed URLs (mirror `generate-invoice-pdf`).

**SEC-4 · P0 · Edge/banking · Missing-tenant-check · Blocks: Y**
*Evidence:* `truelayer-auth/index.ts:41-158` verifies JWT but the default `mode='connect'` path derives org from the caller-supplied `entity_id` with **no membership/`portal_access`/`allow_bank_connect` check**; `truelayer-callback:205-215` writes `bank_connections` via service role from that state. `truelayer-sync` IDOR: loads by body `bank_account_id`/`connection_id`, no org match. Portal UI also renders Reconnect/ConnectBankDialog when `allowBankConnect=false` (`PortalBankingTab.tsx:51,76-81`).
*What breaks:* any authenticated user attaches a bank connection to (or forces a transaction pull into) any client/company in any org; the permission flag is decorative.
*Fix:* in `truelayer-auth`, service-role check `portal_has_perm(entity,'allow_bank_connect')` (portal) or `user_in_organization` (staff) before issuing state; gate the UI on the flag.

**SEC-5 · P0 (latent) · DB/RLS · Security risk · Blocks: Y (if multi-org membership possible)**
*Evidence:* `get_user_organization_id() = SELECT organization_id FROM organization_users WHERE user_id=$1 LIMIT 1` (`20251126110349…:11-21`), used in RLS/security paths → arbitrary first org for any user in ≥2 orgs.
*Fix:* remove from RLS; require explicit org context (JWT claim or row column) on every gated path.

**SEC-6 · P1 · DB/RLS · Security risk · Blocks: Y**
8 portal SELECT policies gate only on portal access and **ignore the `show_*` visibility flags** the practice sets: `bank_transactions`/`bank_accounts`/`vat_returns`/`ledger_entries`/`bookkeeping_accounts`/`trial_balance_snapshots` (`20251129230654`), `invoices`(+`TO public`)/`invoice_payments` (`20260604223821:51-61`). A client with a module toggled *off* can still `SELECT` the rows via API. *Fix:* swap each `USING` to `portal_has_perm(client_id,company_id,'<flag>')`; change the `invoices` policy `TO authenticated`.

**SEC-7 · P1 · Anon onboarding · IDOR · Blocks: Y (flag is OFF)**
`lifecycle_require_onboarding_token` (`20260625110822…:30-59`) enforces the token **only when `is_canonical_lifecycle_enabled`**; else a **NULL token passes**. With the flag off (its default/operative state), anon can call `public_get_onboarding`/`public_sign_engagement_letter`/`public_record_aml_upload`/`public_complete_billing` with just a guessed `application_id`. *Fix:* require a valid token unconditionally.

**SEC-8 · P1 · Edge · Missing-auth · Blocks: Y**
`gmail-sync`/`outlook-sync` (`verify_jwt=false`, no Authorization read, `:186-192`/`:139-145`) are anonymously invokable — leak every connected mailbox address + sync state and can force token refreshes. `stripe-checkout` (verify_jwt=true but never calls `getUser`) trusts body `organizationId`. `hmrc-ct-poll`/`hmrc-ct-delete` (`verify_jwt=false`, no secret) are public service-role workers hitting HMRC. *Fix:* require `bearer === SERVICE_ROLE_KEY` (the check `gmail-send:170` already has) / `CRON_SECRET`; `requireOrgContext` on stripe-checkout.

**SEC-9 · P2 · Edge · Test-only-in-prod · Blocks: Y**
`seed-portal-test-users` + `portal-qa-probe` ship to prod with a **hardcoded password `PortalQA!2026`** and no env gate; `gdpr-data-deletion` anonymises the **whole org** ignoring `target_user_id`; `clone-workpaper-template` fetches templates by id with no org filter (cross-tenant clone). `_shared/hmrc-auth.ts:12` `ENCRYPTION_KEY` falls back to `'default-dev-key-change-in-production'`. *(verify live)*

### Lifecycle / data integrity

**LC-1 · P0 · Job creation · Broken · Blocks: Y**
Both gates materialise jobs in the live (flag-OFF) config: `public_accept_quote_by_token` (`20260629163528…:208-212`) and `lifecycle_approve_onboarding` (`20260629091343…:207-209`, unconditional). Dedupe keys on `period_label`, which is **mutable/derived** — a company accepted without a year-end gets label `'Setup Pending'` + statutory deadlines computed from a fake 30-day period (`lifecycle_materialize_jobs:163-176`); at approval the year-end is set → label `'YYYY Year-End'` → dedupe misses → **second job** + orphan "Setup Pending" job + garbage CH/CT deadlines. Same across the 6-April SA boundary and month boundaries for payroll. *Fix:* make approval the only materialisation gate; at approve, absorb/relabel any existing `'Setup Pending'` job.

**LC-2 · P0 · Duplicate engines · Duplicate · Blocks: Y**
Five job-creation paths bypass the canonical core, none setting `period_label`, so none is constrained by `jobs_*_period_uq` (NULLS DISTINCT → NULL-label rows never conflict): `chaser-trigger-scan:354`, `auto-rollover-service.ts:113-133`, `automation-actions.ts:60-70` (no dedupe), `workflow-step-executor.ts:~305`, `job-template-engine.ts:168`. *Fix:* route all through `lifecycle_upsert_job_with_deadlines`; forbid NULL `period_label`.

**LC-3 · P0 · Rollover · Duplicate · Blocks: Y**
Two rollover engines with incompatible dedupe keys: SQL trigger `tg_job_completed_rollover` (`20260630082250:16-81`, dedupes on `period_label`) vs frontend `executeAutoRollover` (`auto-rollover-service.ts:74-133`, direct insert, NULL label, dedupes on `period_end`). Normal sequence (mark filed → then completed) creates two next-year jobs. *Fix:* delete the frontend rollover; keep the trigger as sole engine; port its VAT/payroll/CIS TODO into the core.

**LC-4 · P1 · Client activation · Inconsistent · Blocks: Y**
Flag-OFF, `public_accept_quote_by_token` writes `accountant_client_links` `status='active'` at **accept** (before EL/AML/approval) — the entire gated model (`lifecycle_onboarding_gates`, 6 gates) is bypassed because enforcement sits inside `IF is_canonical_lifecycle_enabled`. A second, dormant spine (`org_settings.canonical_spine_v1`, `20260621182446`) is still installed and re-armable. Plus a legacy non-transactional "Convert to Client" path (`LeadDetailPanel.tsx:355` → `lead-conversion-service.ts:100-188`) coexists with the canonical RPC. *Fix:* pick the gated model, flip the flag per-org, delete the accept-side activation + the dormant spine + the legacy convert path.

**LC-5 · P1 · Onboarding creation/approval · Partial · Blocks: Y**
`onboarding_applications` is created **lazily by a read RPC** (`public_get_quote_by_token:83-121`, SELECT-then-INSERT, no unique on `quote_id`) — if the prospect never reloads the quote page, no application exists and the pipeline stalls; two tabs race → two applications. And `lifecycle_approve_onboarding` has **no `FOR UPDATE`** (`:37`) — double-click → duplicate records-request emails/tasks/portal invites. *Fix:* create the application inside `public_accept_quote_by_token` (same tx) + `UNIQUE(quote_id)`; add `FOR UPDATE` + replay to approve.

**LC-6 · P1 · Job status machine · Inconsistent · Blocks: Y**
The transition trigger's `valid_transitions` map (`20260408203205:32`) still contains legacy statuses the CHECK forbids; multiple dialogs write `jobs.status` directly, bypassing `job-status-service.ts`. Critically, **portal record submission has no server-side transition to `records_received`** — the client submits, the job never advances. *Fix:* single `lifecycle_set_job_status` RPC; regenerate the map from the canonical enum; add the portal-submission hook.

### Filing / workpapers

**FIL-1 · P0 · Filing approval · Broken (dead code) · Blocks: Y**
The spec invariant "no submission without an approved-model-version reference" is unenforced: `filing-approval-service.ts` + `workflow-integrity-service.ts` are imported by **no file**; `validate_filing_submission`/`queue_filing_for_submission`/`filing_queue` have no invoker/consumer; `filings.model_snapshot_id` is nullable with no trigger; `submit_filing_safe` checks permission only. *Fix:* trigger blocking transition to submitted/filed when `model_snapshot_id IS NULL` or no active `filing_approvals`; wire `createFilingApproval`/`validateFilingForSubmission` into the UI.

**FIL-2 · P0 · Filing · Broken · Blocks: Y**
`markFilingAsFiled` (`filing-service.ts:523-613`) has **no prior-status precondition, no approval/snapshot/receipt check**, free-text/optional reference, and fires rollover — wired to two buttons (`JobFilingTab.tsx:83`, `FilingDetail.tsx:146`). It is the only live "filing" path for every non-payroll type. *Fix:* require `status IN ('submitted','accepted')` or an explicit `manual_filing` flag with mandatory reason→audit; block when no snapshot.

**FIL-3 · P0 · Filing transport · Broken/Missing · Blocks: Y**
VAT "Submit" (`VATReturnsTab.tsx:183-198`) is a local `status='submitted'` flip — `hmrc-vat-submit` has zero UI callers. CT600's real transport (`hmrc-ct-submit`) has zero UI callers. The generic provider (`filing-api-provider.ts:135-166`) is a **mock fabricating acceptance + reference numbers** — currently reachable only via payroll (a latent landmine one wiring change from faking CT/VAT), but VAT/CT being unfiled is live now. *Fix:* wire VAT/CT UI to the real edge functions; persist HMRC receipts; delete/env-gate the mock providers.

**FIL-4 · P0 (payroll) · Filing · Broken · Blocks: Y**
RTI/CIS auto-mark filings `filed` on **simulated** acceptance (`filing-service.ts:833-842`; `rti-submit:44-90` sandbox default, production "not yet implemented"); IRmark is faked (`IRMARK-${Date.now()}`, CT600 IRmark hardcoded `"0"`). IRmark is HMRC's mandatory integrity hash → live rejection. *Fix:* real IRmark; block `filed` when response env ≠ production.

**FIL-5 · P1 · Workpapers · Inconsistent · Blocks: Y**
TB→workpaper mapping is **real** (`workpaper-from-tb.ts:145-243`), but three stores exist with divergent status vocab — `workpaper_instances`, `job_workpaper_instances`, `filing_model_snapshots` — and `filings.workpaper_instance_id`/`filing_model_snapshots.source_workpaper_id` still FK the **legacy** table. A workpaper finalised in the live store is invisible to the filing/snapshot layer. *Fix:* pick `job_workpaper_instances` as SoT, re-point FKs, one status enum.

**FIL-6 · P1 · Filing idempotency · Partial · Blocks: Y**
`idx_filings_idempotency_key` exists but **nothing writes `filings.idempotency_key`** (the generator in `filing-snapshot-service.ts:71` has zero callers). `hmrc-vat-submit` dedupes only on `status='accepted'`, so an in-flight/pending prior attempt doesn't block a retry → **duplicate HMRC submission** on network-failure retry. *Fix:* set the key at filing creation; refuse submit when an unresolved `filing_submissions` row exists.

### Functional / automation / email

**FUN-1 · P0 · Portal invite · Broken · Blocks: Y**
`accept-portal-invite-signup:119-124` returns `created`/`already_exists`; `PortalInvite.tsx:48-52` throws on any status ≠ `ok`/`success`. Nothing calls `lifecycle_accept_portal_invitation` — the only code that sets `portal_access.status='active'`. **No new client can enter the portal.** *Fix:* treat `created`/`already_exists` as success; after sign-in call `lifecycle_accept_portal_invitation(token)`; add a no-access screen to break the login↔guard loop (`PortalGuard.tsx:63`).

**FUN-2 · P0 · Automation · Broken (unscheduled) · Blocks: Y**
Grep of all migrations: only `process-email-queue`, `sync-gmail-emails`, `sync-outlook-emails`, `truelayer-sync-scheduled` have `cron.schedule`. **No cron** for `chaser-tick`, `chaser-trigger-scan`, `workflow-tick`, `process-automation-events`, `sla-check`, `session-cleanup`, `invoice-overdue-scan`, `dormant-lead-scan`, `hmrc-ct-poll`. Chasers, CRM follow-ups, SLA, overdue-invoice, both automation engines — configured in UI, never fire. *Fix:* one migration scheduling `workflow-tick` + `chaser-tick` (+ `CRON_SECRET` gate per SEC-8); pick one automation engine. *(verify live — dashboard-created cron may exist outside git)*

**FUN-3 · P0 · Engagement letter · Broken · Blocks: Y**
The emailed sign link `https://client.…/engagement/${signature_token}` (`send-engagement-letter:155`) routes to `EngagementLetterPreview.tsx` (`App.tsx:588`) which is **read-only** — no signature capture, no write. The only working sign path is inside `/onboard/:id`. A standalone-sent EL can never be signed → blocks conversion (signed-EL gate). *Fix:* point signing_url at the onboarding sign step, or add capture + `public_sign_engagement_letter` to the preview route.

**FUN-4 · P0 · Email queue · Broken · Blocks: Y**
No producer sets `idempotency_key` (`send-invoice:93-108`, `send-engagement-letter:223`, `chaser-tick:219`); `process-email-queue` does a non-atomic SELECT-then-UPDATE "already sent" check and writes `email_send_log` **before** deleting the queue row → duplicate client emails on double-click/concurrent workers, and infinite re-send if the delete fails. `_shared/idempotency.ts` + `idempotency_keys` exist, imported nowhere. *Fix:* producers set a key; unique partial index on pending; claim via `UPDATE … RETURNING`; log+dequeue atomically.

**FUN-5 · P1 · Portal actions · Broken/Missing · Blocks: Y**
Portal see-but-can't-act: receipt upload always fails (storage INSERT policy is org-members only — `20251127104447:6-15` — no portal policy, yet the tab shows when `allow_receipt_upload`); Tasks page has zero action controls though the UPDATE policy exists; no document-upload control anywhere; `send-invoice` only perm-checks DRAFT invoices (issued invoices email for anyone with SELECT). *Fix:* portal storage INSERT policy; task action button; document upload; `allow_invoice_send` check in `send-invoice` for portal callers.

**FUN-6 · P1 · Accountant journeys · Partial/Duplicate · Blocks: Y**
CH profile discarded at lead capture (`CRM.tsx:577-588` keeps only `company_name`, yet conversion depends on the profile); service-assignment UI disabled for existing clients (`ClientServicesTab.tsx:92`); orphan duplicate `InvoicesTab.tsx` (zero importers) beside the live `SalesTab`; `invoice-overdue-scan` unscheduled. *Fix:* persist CH profile on insert; build engagement-create dialog; delete orphan; schedule scan.

### Quality gate

**QG-1 · P2 · Lint · Blocks: N** — `eslint` fails with **1038 errors** (mostly `@typescript-eslint/no-explicit-any` in edge functions + `prefer-const`/`no-require-imports`). Not runtime breakage, but a failing gate and a review-signal degrader.
**QG-2 · P3 · Build · Blocks: N** — single 3.7 MB (990 KB gzip) JS chunk, no code-splitting.

---

## 3. Prioritised Fix List

Ordered by dependency and blast radius: tenant-security first (active exploit surface), then lifecycle/filing integrity (wrong books / fake filing), then the portal/automation gaps that make the product usable, then hardening and polish.

**Fix 1 — Close the raw ledger-RPC authz bypass (SEC-1)**
- Priority: P0 · Why now: live cross-tenant financial-write hole, exposed by portal UI.
- Files: `20260703215530…`, `20260704090000…`, `20260703213012…` (add internal `user_in_organization` + drop `p_user_id` trust); or a new REVOKE migration.
- Acceptance: cross-org raw call → `not_authorized`, nothing written; `created_by`=`auth.uid()`. Regression: `record_invoice_payment_safe`, Stripe verify (service role), `apply_bank_match` still work. Complexity: Small.

**Fix 2 — Authenticate the filing submitters + PDF (SEC-2, SEC-3)**
- Priority: P0 · Why now: unauthenticated statutory filing + PII to public URL.
- Files: `hmrc-ct-submit`, `cis-submit`, `rti-submit`, `generate-filing-pdf` — adopt `_shared/auth.ts requireOrgContext`, derive org from the verified filing, private bucket + signed URLs.
- Acceptance: body-id call without membership → 403; PDF requires valid token + org match. Complexity: Medium.

**Fix 3 — Gate bank-connect + sync + stripe-checkout + mailbox sync (SEC-4, SEC-8)**
- Priority: P0/P1 · Files: `truelayer-auth`/`truelayer-callback`/`truelayer-sync`, `stripe-checkout`, `gmail-sync`/`outlook-sync`, `hmrc-ct-poll/delete`. Add entity/membership checks + `SERVICE_ROLE_KEY`/`CRON_SECRET` gates. Acceptance: portal user without `allow_bank_connect` → 403. Complexity: Medium.

**Fix 4 — Fix multi-org context + portal visibility policies + anon token bypass (SEC-5, SEC-6, SEC-7)**
- Priority: P0/P1 · Files: `get_user_organization_id` (remove from RLS), 8 portal SELECT policies → `portal_has_perm`, `lifecycle_require_onboarding_token` (require token). Complexity: Medium.

**Fix 5 — Make the portal enterable (FUN-1)**
- Priority: P0 · Files: `PortalInvite.tsx`, add `lifecycle_accept_portal_invitation` call, `PortalGuard.tsx` no-access screen. Acceptance: fresh invite → set password → land on dashboard with entities. Complexity: Small.

**Fix 6 — Enforce the filing approval gate + kill the bypass (FIL-1, FIL-2)**
- Priority: P0 · Files: trigger on `filings` (block submit/filed without snapshot+approval); `markFilingAsFiled` gated; wire `filing-approval-service` into UI. Acceptance: `UPDATE filings SET status='filed'` on unapproved filing → rejected. Complexity: Medium.

**Fix 7 — Wire real HMRC submission; stop faking acceptance (FIL-3, FIL-4)**
- Priority: P0 · Files: `VATReturnsTab.tsx`→`hmrc-vat-submit`; CT600 submit UI→`hmrc-ct-submit`; real IRmark in `rti/cis-submission-engine`; env-gate/delete mock providers; block `filed` on non-prod responses. Complexity: Large.

**Fix 8 — Single activation gate + kill duplicate job/rollover engines (LC-1, LC-2, LC-3)**
- Priority: P0 · Files: `public_accept_quote_by_token` (stop materialising), `lifecycle_materialize_jobs` (absorb Setup-Pending), 5 rogue writers → core, delete frontend rollover. Acceptance: accept→approve → exactly 1 job/service, 0 Setup-Pending. Complexity: Large.

**Fix 9 — Schedule the automation cluster (FUN-2)**
- Priority: P0 · Files: one migration `cron.schedule` for `workflow-tick`+`chaser-tick` (post-Fix-3 secret gate); pick one engine. Acceptance: rule→event→action row within one tick. Complexity: Small. *(verify live first)*

**Fix 10 — Email-queue idempotency + atomic claim (FUN-4)**
- Priority: P0 · Files: producers set key; `process-email-queue` claim-via-RETURNING + log-then-dequeue atomic; unique partial index. Complexity: Medium.

**Fix 11 — Engagement-letter signing path (FUN-3)** · P0 · repoint signing_url or add capture RPC. Small.

**Fix 12 — Portal action completeness (FUN-5)** · P1 · receipt storage policy, task action, document upload, `send-invoice` perm gate. Medium.

**Fix 13 — Onboarding creation/approval robustness (LC-5)** · P1 · create app in accept tx + `UNIQUE(quote_id)`; `FOR UPDATE`+replay on approve. Medium.

**Fix 14 — Consolidate activation/spine/convert paths (LC-4)** · P1 · flip flag per-org, delete accept-activation + dormant spine + legacy convert. Medium.

**Fix 15 — Job status machine + portal records_received hook (LC-6)** · P1. Medium.

**Fix 16 — Workpaper store consolidation + FK re-point (FIL-5)** · P1. Medium.

**Fix 17 — Filing idempotency key wiring (FIL-6)** · P1. Small.

**Fix 18 — Backstop indexes: unconditional recreate + NULLS NOT DISTINCT (see §6)** · P1. Small. *(verify live)*

**Fix 19 — CH profile persist + service-assignment UI + orphan cleanup + overdue-scan schedule (FUN-6)** · P1. Medium.

**Fix 20 — Subscription enforcement gate (see §11 A9)** · P1. Small.

**Fix 21 — Remove test/dev artefacts from prod (SEC-9, dead code)** · P2 · env-gate `seed-portal-test-users`/`portal-qa-probe` (rotate password), scope `gdpr-data-deletion`, org-filter `clone-workpaper-template`, strip `e2e-flow-validation` + `/color-comparison`, delete ~1,600 lines orphan components. Medium.

**Fix 22 — Error-as-empty on core lists + FX silent failure (frontend F6/F7)** · P2. Small.

**Fix 23 — Payroll/CIS nav visibility + disabled-stub cleanup (frontend F2/F5)** · P2. Small.

**Fix 24 — Lint debt (QG-1) + code-splitting (QG-2)** · P2/P3. Medium.

---

## 4. Canonical Lifecycle Audit

| Lifecycle step | Current implementation | Expected | Status | Files/RPCs | Breakage | Fix |
|---|---|---|---|---|---|---|
| lead → quote sent | `lifecycle_send_quote` + token + email_queue | same | ✅ OK | `20260602205415:160`; QuoteDetail.tsx:88 | — | — |
| quote accepted | pending entities **+ active links + jobs/deadlines** (flag OFF) | pending shell only | ❌ Broken | `public_accept_quote_by_token` `20260629163528:104-212` | LC-1, LC-4 | one gate = approval |
| onboarding created | lazily by read RPC | atomically at accept | ⚠️ Partial | `public_get_quote_by_token:83-121` | LC-5 stall/dup | create in accept tx + uq(quote_id) |
| EL signed | `public_sign_engagement_letter` (onboarding only); emailed link dead | same, gated | ❌ Broken | PublicOnboarding.tsx:236; EngagementLetterPreview | FUN-3 | repoint link |
| AML/docs | `public_record_aml_upload`; gates only if flag ON | gated | ⚠️ Partial | `20260624075656` | LC-4 | flip flag |
| accountant approval | `lifecycle_approve_onboarding` (+`verify_aml_and_approve`) | single idempotent gate | ⚠️ Partial | `20260629091343` | LC-5 no lock; LC-1 re-materialise | FOR UPDATE + absorb |
| active client | links at accept (OFF) vs approve (ON) | at approve only | ❌ Inconsistent | LC-4 | pre-AML activation | remove accept branch |
| services/jobs/deadlines | core + 5 rogue engines | single core | ❌ Duplicate | LC-2 | NULL-label dups | route via core |
| questionnaire released | frontend insert, ungated | RPC-gated | ⚠️ Inconsistent | SendQuestionnaireDialog.tsx:96 | — | RPC |
| client submits records → records_received | **no server transition** | portal→status hook | ❌ Missing | job-status-service.ts | job never advances | LC-6 hook |
| workpaper | 3 stores, legacy FK | 1 SoT | ❌ Duplicate | FIL-5 | lineage broken | consolidate |
| review → client approval | `filing_approvals` writer dead; illegal-status RPC `approve_filing_safe` | one live writer + gate | ❌ Broken | FIL-1 | gate is dead code | wire + trigger |
| filing submitted/accepted | status flip / mock / markAsFiled; real transport orphaned | authenticated real submit, receipt persisted | ❌ Broken | FIL-2, FIL-3, FIL-4 | fake/absent filing | wire real HMRC |
| job completed → rollover | trigger + frontend engine | trigger only | ❌ Duplicate | LC-3 | dup next-year jobs | delete FE engine |

---

## 5. Duplicate Engine Audit

| Domain | Duplicate paths | Canonical | Legacy/conflicting | Risk | Action |
|---|---|---|---|---|---|
| Job creation | core RPC; chaser-scan:354; automation-actions:60; workflow-step-executor; job-template-engine:168; dormant spine | `lifecycle_upsert_job_with_deadlines` | 5 direct inserts + spine | NULL-label dups (P0) | route all via core; drop spine |
| Deadlines | core; auto-rollover CIS insert (UPPERCASE code); spine + trigger | core | FE CIS, spine | mismatched deadlines | port CIS into core; drop spine trigger |
| Rollover | `tg_job_completed_rollover`; `executeAutoRollover` | trigger | FE service | dup next-year jobs (P0) | delete FE insert |
| Client activation | links at accept vs approve; `lifecycle_evaluate_onboarding_activation`; legacy convert | approve RPC | accept branch + convert | pre-AML activation | remove accept branch + convert |
| Quote acceptance | `public_accept_quote_by_token`; dead `lifecycle_accept_quote` | public token RPC | dead RPC | confusion | drop dead RPC |
| Onboarding approval | `lifecycle_approve_onboarding` (+wrapper) | approve RPC | — | LC-5 concurrency | add row lock |
| Invoice payment/void | `*_safe` wrappers vs raw definer fns (both granted) | `*_safe` | raw fns | **cross-tenant write (P0)** | REVOKE raw or add internal authz |
| Workpapers | `workpaper_instances`; `job_workpaper_instances`; snapshots | `job_workpaper_instances` | legacy table (still FK'd) | broken lineage | consolidate + re-point FK |
| Filing submission | real edge fns (orphaned); mock provider; markAsFiled; local status flip | real edge fns | mock + markAsFiled | fake filing (P0) | wire real, gate bypass |
| Invoicing UI | `SalesTab` (live); `InvoicesTab` (orphan) | SalesTab | InvoicesTab | edits ship nowhere | delete orphan |
| Portal messaging UI | `ConversationsTab` (live); `ClientMessagesTab` (orphan) | ConversationsTab | ClientMessagesTab | drift | delete orphan |
| Email queueing | ~30 producers, none keyed; direct sends | queue + process-email-queue | keyless producers | dup emails (P0) | idempotency keys |
| Lifecycle flags | `organizations.canonical_lifecycle_enabled` vs `org_settings.canonical_spine_v1` | first | second | two "canonical" defs | drop spine flag |
| Fee propagation | none (only `engagement_letter_required` flag) | — | — | quote↔invoice drift | add `engagements.agreed_fee` |
| Contacts | none (`contacts` table unused) | — | — | missing | build |

---

## 6. Database / RLS / Security Audit

**Tenant isolation:** SEC-1 (raw ledger RPCs, P0) and SEC-5 (`get_user_organization_id` LIMIT 1, P0) are the cross-tenant holes. `apply_bank_match` (`20260703214240:48-53,85-123`) is the correct positive control — full membership + per-allocation org/entity validation.
**RLS:** SEC-6 — 8 portal SELECT policies ignore `show_*` flags (P1). `invoices` policy is `TO public` (should be `authenticated`). No `CREATE TABLE` without `ENABLE ROW LEVEL SECURITY` found; `USING(true)` confined to global reference tables. Historic storage cross-tenant P0s (filing-documents public bucket, questionnaire/onboarding "any authed user") appear **remediated** (`20251218231937`, `20251218000117`) — *verify live*.
**RPC / SECURITY DEFINER:** the `*_safe` wrappers are correct; the raw wrapped functions are the exposure (SEC-1). `reverse_journal` has no `_safe` wrapper at all.
**Anonymous endpoints:** anon lockdown (`20260703204710`, `20260703201427`, `20260703211752` incl. `ALTER DEFAULT PRIVILEGES … REVOKE … FROM PUBLIC`) is **structurally correct and future-proofed** — but the blanket `GRANT … TO authenticated` is what re-exposed the raw ledger fns (SEC-1), and SEC-7 (NULL-token onboarding bypass when flag OFF) remains.
**Missing constraints / idempotency:** backstop unique indexes (`engagements_quote_service_uq`, `acl_active_*`, `jobs_*_period_uq`) are created **only IF no dup groups exist at apply time** (`20260621155246`/`20260624075633`, `RAISE WARNING … SKIPPED` — does not abort) → may be **permanently absent** with only a transient log line as evidence; and the jobs indexes key on nullable `period_label` with default `NULLS DISTINCT` → NULL-label duplicates never conflict. `filing_submissions.idempotency_key` has no unique index (FIL-6). *(verify live via `pg_indexes`)*
**Enum/status drift:** the `filings` triple-CHECK bug is fixed in git (`20260620150856`), but a 15-value set (`20251218231226`) and `vat_returns`' own vocab still live in code; edge fns writing `submitting`/`accepted` may hard-fail the canonical CHECK. Job-status trigger map contains forbidden legacy values (LC-6).
**Cascade/orphan:** `clients` has a hard-DELETE RLS policy and **no `archived_at`** → hard delete cascades jobs/filings/emails with no audit (§11 A8).
**Audit logging:** broadly present (`bookkeeping_audit_log`, `audit_log`); gaps are the unauthenticated paths that forge `created_by` via `p_user_id` (SEC-1).

---

## 7. Edge Function Audit

59 functions. Full risk table (worst-first); "auth reality" accounts for the anon-key-is-a-valid-JWT gotcha.

| Function | verify_jwt | Auth reality | Tenant check | Deps/secrets | Status | Risk | Fix |
|---|---|---|---|---|---|---|---|
| hmrc-ct-submit | true | **none** | trusts body filingId | HMRC, service-role | **P0** | files real CT600 any org | requireOrgContext |
| cis-submit | true | **none** | trusts body ids | HMRC | **P0** | cross-tenant filing forgery | requireOrgContext |
| rti-submit | true | **none** | trusts body ids | HMRC | **P0** | cross-tenant filing forgery | requireOrgContext |
| generate-filing-pdf | true | **header-presence only** | trusts body id | service-role, public bucket | **P0** | PII→public URL | validate token, private bucket |
| truelayer-auth | true | getUser ✓ | **connect path: none** | TrueLayer | **P1** | bank connect any entity | perm check |
| truelayer-sync | true | getUser ✓ | **IDOR** | TrueLayer | **P1** | pull into any tenant | org match |
| stripe-checkout | true | **no getUser** | trusts body org | Stripe | **P1** | checkout any org | requireOrgContext |
| hmrc-vat-submit | true | getUser+org ✓ | ok | HMRC | **P1** | no approval gate + dup submit | approval + idempotency |
| gmail-sync / outlook-sync | false | **none** | all mailboxes | Gmail/MS | **P1** | leak mailboxes / token burn | SERVICE_ROLE gate |
| hmrc-ct-poll / hmrc-ct-delete | false | **none** | queue | HMRC | **P1** | public HMRC worker + orphaned | CRON_SECRET + schedule |
| chaser-tick / chaser-trigger-scan / workflow-tick / process-automation-events | false | **none** | all orgs | — | **P1** | unsecured + unscheduled | secret + cron |
| send-invoice | true | getUser ✓ | **issued: SELECT-only** | email/Stripe | **P2** | perm bypass on send | allow_invoice_send check |
| process-email-queue | true | role claim | no claim/lease | email | **P2** | duplicate sends | atomic claim |
| clone-workpaper-template | true | getUser+job ✓ | **template no org filter** | — | **P2** | cross-tenant clone | org filter |
| seed-portal-test-users / portal-qa-probe | true | org-member | Blue Tick only | **hardcoded pw** | **P2** | test creds in prod | env-gate, rotate |
| gdpr-data-deletion | true | owner ✓ | **whole-org** | — | **P2** | over-broad delete | scope to subject |
| sla-check / session-cleanup / invoice-overdue-scan / dormant-lead-scan | mixed | none | all-org sweep | — | **P2** | orphaned (dead features) | secret + cron |
| onboarding-stripe-checkout/-verify | false | none (by design) | body id | Stripe | P2 | no rate limit | rate-limit |
| portal-verify-invoice-payment | true | session-match | ok | Stripe | P2 | fallback ledger path | remove fallback |
| ch-submit | true | getUser+org ✓ | CS01 skips approval | CH GovTalk | P2 | ungated CS01 | approval check |
| **Secure (reference patterns):** stripe-webhook (sig+dedup), truelayer-sync-scheduled (x-cron-secret), auth-email-hook (HMAC), accept-portal-invite-signup (token RPC), generate-invoice-pdf (RLS e2e), OAuth `*-callback`/`*-exchange` (state-gated), companies-house-sync, gdpr-data-export, gmail-auth/outlook-auth/hmrc-auth, fx-rates, stripe-connect-onboard, portal-pay-invoice, customer-portal, check-subscription | mixed | correct | correct | — | ✅ OK | — |

**Config note:** `handle-email-unsubscribe` absent from `config.toml` → defaults `verify_jwt=true` → one-click unsubscribe links 401 for recipients (compliance) unless live config differs. Add `verify_jwt=false`.
**Systemic root cause:** `_shared/auth.ts requireOrgContext` (correct membership+permission checks) is imported by **none** of the money/filing/email functions.

---

## 8. Accountant App Journey Audit

| Journey | Status | Evidence | Breakage | Fix | Pri |
|---|---|---|---|---|---|
| Sign-in + org | ✅ Fully-wired | Auth.tsx:85,176; ensure-organization.ts:99 | no multi-org switcher | — | P3 |
| Dashboard | ✅ Fully-wired | DashboardKPICards.tsx:26 (real queries) | — | — | — |
| CRM lead | ✅ Fully-wired | CRM.tsx:153; lead-lifecycle-service.ts | follow-up sequences have no executor (FUN-2) | cron | P1 |
| Companies House lookup | ⚠️ Partial | companies-house-lookup.ts:57; CRM.tsx:577 | full CH profile discarded at capture | persist JSONB | P1 |
| Quote create/send/accept | ✅ Fully-wired | CreateQuoteDialog; lifecycle_send_quote; public_accept_quote_by_token | sa_blocked shows success | surface warning | P2 |
| Engagement letter sign | ❌ Broken | send-engagement-letter:155; EngagementLetterPreview (read-only) | emailed link can't sign | FUN-3 | **P0** |
| Onboarding application | ✅ Fully-wired | PublicOnboarding.tsx | — | — | — |
| AML/KYC | ✅ Fully-wired (manual) | verify_aml_and_approve | kyc-pack-service unwired | wire/retire | P2 |
| Client activation | ✅/⚠️ Duplicated | lifecycle_approve_onboarding vs legacy convert | two paths (LC-4) | route via RPC | P1 |
| Client record | ✅ Fully-wired | AddClientDialog; EditClientDialog | disabled stubs (Send Email/New Job) | wire/remove | P2 |
| Services + fee propagation | ⚠️ Partial | Services.tsx:171; ClientServicesTab.tsx:92 disabled | no assign-to-client UI; no fee propagation | build dialog | P1 |
| Jobs / Deadlines | ✅ Fully-wired | lifecycle_create_manual_job; deadline-engine.ts | no re-sync cron | cron | P2 |
| Questionnaires | ✅ Fully-wired | TemplateDetail; SendQuestionnaireDialog | no response viewer; file-q stub | viewer | P2 |
| Documents / Workpapers | ✅ Fully-wired | document-service.ts; clone-workpaper-template | TB not auto-mapped; 3 stores | FIL-5 | P2 |
| Billing/invoicing | ✅/❌ Duplicated | SalesTab (live); InvoicesTab (orphan) | orphan; overdue scan unscheduled | delete + cron | P1 |
| Conversations/emails | ✅ Fully-wired | queue_email_safe; gmail/outlook sync (scheduled) | — | — | — |
| Team/users/roles | ✅ UI wired | PermissionsSettings.tsx:130 | RLS matrix enforcement unverified | verify | P2 |
| Settings / Automation | ⚠️ UI-no-execution | Automations.tsx:134; triggers emitted | executors unscheduled (FUN-2) | cron | **P0** |
| Filing: CH CS01 | ✅ wired (ungated) | JobFilingTab.tsx:137→ch-submit | no approval gate | FIL-1 | P2 |
| Filing: CH accounts | ⚠️ dead-ended | JobFilingTab.tsx:135 CS01-only | gate can't pass (no approval writer) | FIL-1 | P1 |
| Filing: VAT/MTD | ❌ UI-no-backend | VATReturnsTab.tsx:183 status flip | fakes submission | FIL-3 | **P0** |
| Filing: CT600 | ❌ Backend-no-UI | hmrc-ct-submit zero callers | can't submit | FIL-3 | **P0** |
| Filing: SA / MTD-ITSA | ⚠️ prepare-only / absent | FilingDetail.tsx:332 | no transport | FIL-3 | P1 |
| Filing lifecycle/approval | ❌ Broken (bypass) | FilingDetail.tsx:535 markAsFiled | no approval/snapshot gate | FIL-1/FIL-2 | **P0** |

---

## 9. Client Portal Journey Audit

| Journey | Status | Evidence | Breakage | Fix | Pri |
|---|---|---|---|---|---|
| Login / password reset | ✅ Fully-wired | PortalLogin.tsx:20; PortalForgotPassword | enumeration-safe | — | — |
| Invite accept | ❌ Broken | PortalInvite.tsx:48 vs accept-portal-invite-signup:120; lifecycle_accept_portal_invitation never called | **no client can enter** | FUN-1 | **P0** |
| Guard / no-access | ⚠️ Partial | PortalGuard.tsx:63 | login↔guard loop, no no-access screen | FUN-1 | P1 |
| Entity switching | ⚠️ Partial | PortalEntityContext; PortalMessages.tsx:23 | thread persists across switch → cross-entity thread corruption | reset activeId | P2 |
| Dashboard / deadlines | ⚠️ Partial | PortalDashboard.tsx:67 | counts drafts as unpaid; View-All→tasks not deadlines | filter/relabel | P2 |
| Tasks | ❌ Backend-no-UI | PortalTasks.tsx (list only) | zero action controls though UPDATE policy exists | FUN-5 | P1 |
| Questionnaires | ⚠️ Partial | portalQuestionnairesService.ts:25 | Open link dead when token expired | disable | P2 |
| Document viewing | ✅ Fully-wired | portalDocumentsService.ts:113 | — | — | — |
| Document upload | ❌ Missing | PortalDocuments.tsx:44 | no upload control at all | FUN-5 | P1 |
| Receipt upload | ❌ Broken | ReceiptsTab.tsx:118; storage policy org-only 20251127104447 | always fails despite perm | FUN-5 | **P1** |
| EL view/sign | ❌ Missing | (no engagement refs in portal) | can't see/sign in portal | FUN-3 | P2 |
| Messages | ✅ Fully-wired | portal_send_message | localStorage read-state | — | P3 |
| Queries reply | ⚠️ Partial | PortalQueriesPanel.tsx:52 | INSERT not gated by allow_query_respond | RPC/policy | P2 |
| Pay invoice | ✅ Fully-wired | portal-pay-invoice; portal-verify-invoice-payment | draft/void invoices listed | filter | P2 |
| Bank connect (TrueLayer) | ❌ Authz hole | truelayer-auth:41; PortalBankingTab.tsx:51 | connect any entity; Reconnect shown when disallowed | SEC-4 | **P0** |
| Categorise / VAT approve / invoicing | ✅ Fully-wired | portal_categorise_transaction; portal_approve_vat_return; create_invoice_draft_safe | send-invoice perm bypass for issued (FUN-5) | perm gate | P1 |
| Record payment (portal Sales) | ❌ Authz hole | SalesTab.tsx:301; record_invoice_payment (no authz) | post payments to any invoice/org | SEC-1 | **P0** |
| Read visibility flags | ⚠️ UI-only | 20251129230654 SELECT policies | show_* hide tabs not data | SEC-6 | P1 |

---

## 10. Testing / Build Results

Commands run at commit `3d4b0eb`:

| Command | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | ✅ PASS | 0 type errors |
| `npm run build` (`vite build`) | ✅ PASS | built; ⚠️ single 3.7 MB (990 KB gzip) chunk, no splitting (QG-2) |
| `npm test` (`vitest run`) | ✅ PASS | 13 files, **140 tests** pass (incl. RLS-cross-org, vocabulary-drift, job-status, portal-messaging regressions) |
| `npm run lint` (`eslint .`) | ❌ FAIL | **1038 errors, 36 warnings** — mostly `@typescript-eslint/no-explicit-any` (edge fns), `prefer-const`, `no-require-imports` (QG-1). Not runtime breakage; blocks a clean gate. → Fix 24 |
| `npm run test:e2e` / playwright | — DOES NOT EXIST | no e2e script; `smoke` (`bun scripts/smoke-test.ts`) exists, not run (bun) |

**Critical caveat:** green tests + build do **not** indicate workflow safety. None of the P0s (cross-tenant RPC, fake filing, portal invite, unscheduled cron, duplicate jobs) is covered by the test suite — they are integration/security/state-machine failures the unit tests don't reach.

---

## 11. Stress Test Scenarios

| Scenario | Expected | Current (from code) | Risk | Fix | Pri |
|---|---|---|---|---|---|
| Double quote acceptance | idempotent replay | `FOR UPDATE` + replay ✅ | low | — | — |
| Repeated onboarding approval | idempotent | **no `FOR UPDATE`** → dup emails/tasks/invites | High | LC-5 | P1 |
| Duplicate client activation | one path | two (accept vs approve; + legacy convert) | High | LC-4 | P0/P1 |
| Duplicate job creation | blocked by uq | 5 engines w/ NULL label bypass index | High | LC-2 | **P0** |
| Duplicate deadline creation | one engine | core + FE CIS + spine | High | LC-2/LC-3 | P0 |
| Email queue retry | dedupe by key | **no keys, non-atomic claim, log-before-dequeue** | High | FUN-4 | **P0** |
| Same email across orgs | org-scoped | `UNIQUE(org,email)` ✅ | — | — | — |
| Same client multiple orgs / user multi-org | explicit org context | `get_user_organization_id` LIMIT 1 → **bleed** | High | SEC-5 | **P0** |
| Portal user switching entities | isolated | messages thread persists → cross-entity corruption | Med | LC (F10) | P2 |
| Edge function retry | idempotent | most not; HMRC in-flight not blocked → **dup submit** | High | FIL-6 | P1 |
| Failed external API mid-call | atomic/resumable | billing two-upsert drift; CIS/RTI log after remote | Med | A2 | P1 |
| Filing pending→failed→accepted | idempotency key guards | `filings.idempotency_key` never written → guard inert | High | FIL-6 | P1 |
| Questionnaire submitted twice | atomic reject | SELECT-then-UPDATE race | Med | A6 | P2 |
| Records verified twice | idempotent | `info_received_at` not COALESCE'd; events re-fire | Med | A7 | P2 |
| Job completion + rollover | one next job | two engines → **dup next-year job** | High | LC-3 | **P0** |
| Deleted/archived client | soft-delete + skip | **hard DELETE, no `archived_at`** | Med | A8 | P2 |
| Suspended subscription | access revoked | `billing_status` written but **no gate** enforces it | Med | A9/Fix20 | P1 |
| HMRC token expiry mid-submit | clear re-auth | default `ENCRYPTION_KEY` fallback; column mismatch | Med | A12 | P1 |

---

## 12. Dead Code / Shadow Code / Mock Data

**Orphan components (zero importers, ~1,600 lines):** `components/bookkeeping/InvoicesTab.tsx` (dup of SalesTab), `components/client-portal/ClientBankingTab.tsx`, `components/client-portal/ClientMessagesTab.tsx` (dup of ConversationsTab), `components/filings/accounts/TBImportButton.tsx`, `components/onboarding/ProfessionalClearanceSection.tsx` + `OnboardingQuestionnaireSection.tsx`, `pages/PlaceholderPage.tsx` (imported, never routed).
**Dead lib modules (~28 KB):** `lib/file-routing-utils.ts`, `lib/engagement-change-service.ts`, `lib/job-exception-handler.ts`, and the entire unwired safety layer — `lib/filing-approval-service.ts`, `lib/workflow-integrity-service.ts`, `lib/filing-snapshot-service.ts` (generator/checker), `_shared/idempotency.ts`, `filing_queue` + `validate_filing_submission`/`queue_filing_for_submission` RPCs.
**Shipped dev/test artefacts:** `lib/e2e-flow-validation.ts` (728 lines, fires mutation-shaped probe RPCs incl. `lifecycle_approve_onboarding` at the live DB from `OnboardingDiagnostics`), `pages/ColorComparison.tsx` (**public unguarded** `/color-comparison` route), `seed-portal-test-users`/`portal-qa-probe` edge fns.
**Duplicate hooks/dialogs:** `InvoicesTab`↔`SalesTab`, `ClientMessagesTab`↔`ConversationsTab` — the Lovable parallel-edit drift where a fix on the dead twin ships nowhere.
**Mock data — clean:** **no mock data found in production render paths.** All flagged instances (`BrandPreviewInvoice` sample, `OpsHealth` RLS-probe UUIDs, `EngagementLetterPreview` SAMPLE_*) are preview/diagnostic contexts. Dashboards fetch real data.
**Legacy statuses/tables conflicting with current behaviour:** `workpaper_instances` (legacy, still FK'd), the 15-value filing-status set + `vat_returns` vocab, the job-status trigger's forbidden legacy keys, `canonical_spine_v1` flag + spine RPCs/trigger.

---

## 13. Recommended Execution Plan

**Phase 1 — Stop release-blocking breakages (security + active corruption):** Fix 1 (raw ledger authz), Fix 2 (filing-submitter auth + PDF PII), Fix 3 (bank/stripe/mailbox gates), Fix 4 (multi-org + portal policies + anon token). *These are live exploit surfaces; do first, they are mostly small.*

**Phase 2 — Canonicalise lifecycle & automations:** Fix 8 (single activation gate + kill duplicate job/rollover engines), Fix 9 (schedule automation), Fix 10 (email idempotency), Fix 13 (onboarding robustness), Fix 14 (activation/spine/convert consolidation), Fix 18 (backstop indexes).

**Phase 3 — Make the accountant app workflow-safe:** Fix 15 (job status machine), Fix 19 (CH profile + service assignment + orphan cleanup + overdue scan), Fix 6 (filing approval gate).

**Phase 4 — Make the client portal action-complete:** Fix 5 (invite — do early, it gates all portal testing), Fix 11 (EL signing), Fix 12 (portal actions), Fix 20 (subscription gate).

**Phase 5 — Filing / workpaper hardening:** Fix 7 (real HMRC submission + IRmark), Fix 16 (workpaper consolidation), Fix 17 (filing idempotency).

**Phase 6 — Polish, observability, regression coverage:** Fix 21 (dead/test artefact removal), Fix 22 (error-as-empty + FX), Fix 23 (nav + stubs), Fix 24 (lint + code-splitting), plus new integration/RLS tests covering every P0 above.

*Note:* Fix 5 (portal invite) is listed in Phase 4 but should be pulled forward — nothing in the portal can be tested until a client can log in.

---

## 14. Final Release Gate — Minimum Client-Ready Criteria

**Build/test:** `tsc`, `build`, `vitest` green (already) **plus** `eslint` green (QG-1) **plus** new integration tests covering each P0. A CI e2e smoke covering lead→accept→approve→portal-login→filing.
**Security:** no raw money/ledger/filing RPC callable by `authenticated` without an internal org check (SEC-1); every edge function touching tenant data uses `requireOrgContext` and derives org from verified state, never the body (SEC-2/3/4/8); no anon endpoint accepts a NULL token (SEC-7); portal SELECT policies honour `show_*` (SEC-6); `get_user_organization_id` removed from RLS (SEC-5); no PII to public buckets (SEC-3). Verified by cross-tenant probe tests.
**Lifecycle:** exactly one activation gate; one job/deadline/rollover engine; accept→approve yields exactly one job per service with 0 "Setup Pending" residue; `period_label` NOT NULL (or `NULLS NOT DISTINCT`) and all five backstop indexes confirmed present on the live DB.
**Portal:** a fresh invite results in a logged-in client with entities; receipt/document upload works; Tasks are actionable; no portal-exposed action calls an unauthenticated write path.
**Accountant app:** engagement letter is signable from the emailed link; automation ticks are scheduled and fire; no filing can reach `filed` without an approval + model snapshot; VAT/CT submit to HMRC (sandbox) and persist a real receipt; no faked IRmark/reference persisted as `filed`.
**Data integrity:** email queue idempotent (no duplicate client emails); HMRC resubmission blocked by in-flight guard; soft-delete/archive for clients; subscription state enforced.
**Regression:** automated tests for double-accept, double-approve, duplicate-job, portal-invite, cross-tenant RPC, and filing-gate bypass — the six failure classes this audit is built on.

---

*Audit produced by 7 parallel domain auditors + static analysis, cross-reconciled. Every material finding cites repo evidence; live-DB divergence is flagged where it changes the conclusion. No code was modified in this run.*
