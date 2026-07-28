# Post-Deploy Verification — 2026-07-28

Scope: the three migrations applied today (mtd_quarterly retirement, service prices,
profiles.email_signature), the DEF-024 edge-function containment, and the frontend deploy
covering DEF-007/009/010/011/014. Batch is **not** marked complete.

## 1. Migration identity (DEF-020/023 evidence)

| Authored version | Executor version | Receipt |
|---|---|---|
| 20260728130000 | 20260728125739 | 2026-07-28-retire-legacy-mtd-quarterly.json |
| 20260728140000 | 20260728125803 | 2026-07-28-service-prices-and-unpriced-state.json |
| 20260728150000 | 20260728125821 | 2026-07-28-profiles-email-signature.json |

All three receipts now carry `migration_identity` with both versions and the authored
sha256. The executor timestamp is a row key only; the authored version remains source
identity. The rename recurred on all three — DEF-020/023 stays open.

Status recorded: **live_verified**.

## 2. DEF-024 adversarial LIVE retest — portal-verify-invoice-payment / portal-pay-invoice

| Case | Result | Evidence |
|---|---|---|
| No Authorization header | Rejected | HTTP 400 `{"error":"Not authenticated"}` (both functions) |
| Anon publishable key as bearer | Rejected | HTTP 400 `{"error":"Not authenticated"}` |
| Malformed JWT (`not.a.jwt`) | Rejected | HTTP 400 `{"error":"Not authenticated"}` |
| Authenticated user, foreign/nonexistent invoice | **NOT EXECUTED** | see below |
| Authorised user, own invoice | **NOT EXECUTED** | see below |

**Blocked arms.** Both require a live portal identity and a live invoice. Neither exists
in production after the 2026-07-27 data wipe: `invoices` has **0 rows**, and the only
active `portal_access` row is the retained DEF-011 evidence identity whose password is
unknown. The `portal-b-qa@accountancyos.test` fixture no longer authenticates. The
executor has no service-role/admin-API access to mint one. These two arms are deferred,
not passed.

**Indistinguishability (static, not live).** Both the "invoice does not exist" and "not
your invoice" paths throw the single constant `NOT_YOURS`
("Invoice not found or not accessible") — index.ts lines 65 and 78. No live confirmation
until the arms above can run.

**No Stripe call before authorisation — confirmed by control flow.** Stripe is first
constructed at line 94; the JWT check (51–58), invoice load (60) and `portal_access`
check under the *user's* token (70–78) all precede it, and each failure throws. The three
executed unauthenticated cases returned before any Stripe interaction.

**verify_jwt — DISCREPANCY.** `supabase/config.toml` declares `verify_jwt = true` for both
functions, but a request with *no* Authorization header reached the function body and was
rejected in code (400), not by the platform (401). The platform gate is therefore not
enforcing on the live deployment; today the in-code check is the only thing rejecting
anonymous callers. Containment holds, defence-in-depth does not. Recorded as open.

## 3. Security scan (live, against the deployed schema)

Run: `security--run_security_scan`, 2026-07-28T13:37:26Z — 683 findings
(682 supabase linter + 1 Lovable).

- **Resolved:** `el_signature_progress` is no longer anonymously executable.
  `has_function_privilege('anon', ...)` = false, authenticated = true. Live REST call as
  anon returns `42501 permission denied for function el_signature_progress`.
- **Signing journey intact:** as anon with a bogus token,
  `public_get_engagement_letter_for_signing` returns
  `{"found": false, "error": "This engagement letter link is invalid or has expired."}`
  and `public_sign_engagement_letter_as_signatory` returns
  `{"success": false, "error": "This signing link is not valid."}` — i.e. reached and
  authorising on the token, not permission-denied.
- **Unchanged (DEF-004):** anon-executable SECURITY DEFINER functions in `public` now
  **325** (was 326). One of 326 closed; the surface obligation is untouched.
- **Unchanged:** 4 SECURITY DEFINER functions without a pinned `search_path`; the bulk
  `function_search_path_mutable` warnings; and
  **new/notable** — `PUBLIC_STORAGE_BUCKET_OVERRIDE`: an unconditional public SELECT
  policy on the private `invoice-branding` bucket makes every org's branding assets
  readable by anyone. Not previously tracked; needs a defect id.

## 4. Frontend smoke retest — NOT EXECUTED

/jobs, the portal pages, the automation settings centre and the quote picker are all
behind authentication, and no usable session exists (preview session is `signed_out`,
the portal fixture no longer authenticates). The live browser smoke for
DEF-007/009/011/014/010 is therefore **deferred**, not passed.

Static guards for the same five defects are in place and green
(`src/test/regression/audit-remediation-batch-1.test.ts`); full suite **611 passing,
64 files**. Guards assert: `maybeSingle()` on the default-view lookup (DEF-007) and on
`organization_users` plus `.limit(1)` (DEF-011); `format(date, "dd MMM yyyy")` and no
`toLocaleDateString()` in the onboarding stepper (DEF-009); `CategoryKillSwitch` outside
`AccordionTrigger` (DEF-014); `sa_mtd` filtered from the quote picker while the MTD
migration still keys on `sc.code = 'sa_mtd'` (DEF-010). A passing source assertion is not
a live observation.

## 5. Still open

- DEF-010 send-time commercial-treatment guard (line-level treatment field).
- DEF-013 signature rendering in engagement letters and applicable emails.
- DEF-006, DEF-012 — pending reliable LIVE introspection.
- DEF-020/023 — stable deployment identity, executor-rename detection.
- DEF-024 residual — platform `verify_jwt` not enforcing; two adversarial arms deferred.
- DEF-004 — 325 anon-executable SECURITY DEFINER functions.
- New — `invoice-branding` public read override.

No change to the launch position: internal Blue Tick use only. Nothing in this batch
justifies broadening public access or lifting the internal-use restriction.
