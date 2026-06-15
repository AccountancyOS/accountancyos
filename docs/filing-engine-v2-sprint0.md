# Filing Engine v2 — Sprint 0

Status: **Sprint 0 implemented (foundation + proxy + enforcement tests).**
Scope guard: nothing beyond Sprint 0 was built. No quarterly/annual/SA100/BSAS/obligation-sync/production-readiness work.

This document is the Sprint 0 deliverable: Reconnaissance, Reuse, Gap, Plan, Risks,
and Definition-of-Done status. It records two decisions taken with sign-off:

1. **Vault:** deferred. Keep the existing AES-GCM token encryption
   (`ENCRYPTION_KEY` + `organization_integrations_hmrc`). No core-table change.
2. **Proxy scope:** build `hmrc-call-proxy` + shared client + Hello World + fraud
   headers + a static no-bypass enforcement test. Migrating the existing live
   submit functions onto the proxy is a tracked follow-up (see Known Debt).

---

## 1. Reconnaissance Report

### Tenant / RLS
- Tenant = `organization_id`, resolved from `auth.uid()` → `organization_users`.
- Canonical RLS helper: `public.user_has_organization_access(org_id)` (migration `20251125171101`).
  Role hierarchy: `user_has_role_at_least`, `has_role`, enum `app_role`.
- Edge helpers in `supabase/functions/_shared/`: `auth.ts` (`requireOrgContext`),
  `supabase.ts`, `permissions.ts`, `cors.ts`, `responses.ts`, `logging.ts`
  (already redacts secrets), `idempotency.ts`, `rateLimit.ts`.

### Accounting spine (the source the engine consumes — never owns)
`ledger_entries` → `trial_balance_snapshots` (draft/finalised/superseded) →
`job_workpaper_instances` (draft/in_review/**locked**) → `filings`.
VAT spine: `vat_periods` + `vat_period_lines` + `vat_adjustments` + `vat_transaction_links`.
Immutability: `period_locks` + ledger/journal triggers.

### Approval / versioning / locking — ALREADY EXISTS
| Concept | Existing implementation |
|---|---|
| Approved immutable model version | `filing_model_snapshots` (immutable via RLS `USING(false)` + `prevent_snapshot_modification()` trigger, `snapshot_hash`, `approved_by/at`), `accounts_model_snapshots`, `ct_computation_snapshots` |
| Approval artefact | `filing_approvals` (scope ACCOUNTS/CT600, `model_snapshot_id`, `snapshot_hash` binding, revocation, unique active index) |
| Source-hash / approval gate | `validate_filing_submission()` RPC |
| Submission queue | `filing_queue` (idempotency incl. snapshot_hash, `approval_id`) |
| Filing state machine | `filings.status` draft→awaiting_approval→approved→ready_to_file→filed→rejected; `is_locked` |
| Services | `filing-approval-service.ts`, `filing-lock-service.ts`, `filing-snapshot-service.ts`, `filing-version-service.ts` |

### HMRC / submission
- OAuth exists: `hmrc-auth`, `hmrc-callback`, `_shared/hmrc-auth.ts` (auto-refresh).
- **Application model already correct:** one shared AccountancyOS app per
  environment (global `HMRC_CLIENT_ID/SECRET`); per-practice authorisation/tokens
  in `organization_integrations_hmrc`. No per-practice applications.
- Submit functions exist (VAT/CT/RTI/CIS/CH), each calling HMRC directly.
- Audit: `filing_submissions`, `filing_provider_events`, `filing_validations`,
  `filing_payload_artifacts`. Errors normalised by `_shared/hmrc-errors.ts`.

### Tests / CI
- Greenfield: no runner, no `.github/workflows`. Sprint 0 introduces the first
  test harness (below).

## 2. Reuse Report
- **Reuse verbatim:** all `_shared/*` helpers; `user_has_organization_access`;
  `filing_model_snapshots` + `filing_approvals` + `filing_queue` + their services;
  `_shared/hmrc-auth.ts`; `_shared/hmrc-errors.ts`; `organization_integrations_hmrc`;
  `filing_provider_events` audit; `validate_filing_submission()`.
- **Extend:** add fraud-prevention headers + a single chokepoint around the
  existing token/error/audit modules.
- **Untouched:** accounting spine, approval/snapshot tables, period locks, all
  existing workflows.

## 3. Gap Report (only genuinely-missing items)
1. `hmrc-call-proxy` central chokepoint — **built**.
2. Fraud-prevention header layer (browser collect + server merge) — **built**.
3. Test harness for the invariants — **built**.

Already present (so Sprint 0 only adds enforcement tests + an in-engine guard,
no new tables): approval gate, source-hash validation, state machine,
snapshot immutability, OAuth start/callback/refresh.

## 4. Approval-artefact decision (STOP condition)
A complete, immutable, hash-bound approval spine already exists. Creating
`approved_financial_model_versions` would be the prohibited duplicate.
**Decision: consume the existing `filing_approvals` + `filing_model_snapshots`.**
Enforced by `scripts/tests/lib/governance.ts` (`auditApprovalArtefacts`) and the
SQL enforcement script.

---

## 5. What Sprint 0 added

### Production code
- `supabase/functions/hmrc-call-proxy/index.ts` — the single network chokepoint;
  auth via `requireOrgContext`, fraud-header merge, routes through the shared
  client, audited; `action: "hello_world"` round-trip.
- `supabase/functions/_shared/hmrc-client.ts` — `callHmrc()`: the ONLY sanctioned
  HMRC fetch. Token (reuses `hmrc-auth.ts`) + fraud headers + error normalisation
  + redacted `filing_provider_events` audit. Rejects absolute URLs (token-exfil guard).
- `supabase/functions/_shared/hmrc-fraud-prevention.ts` — pure server-side merge
  of `Gov-Client-*` / `Gov-Vendor-*` headers (WEB_APP_VIA_SERVER).
- `supabase/functions/_shared/redaction.ts` — deep secret redaction for audit/logs.
- `supabase/functions/_shared/filing-state-machine.ts` — pure projection/submission
  gates + transition validation mirroring the DB enforcement.
- `src/hmrc/fraud-prevention.ts` — browser collection layer.

### Tests
- `scripts/tests/verify-sprint0.ts` — runtime-agnostic harness (run: `bun run test:sprint0`
  or `deno task verify:sprint0`). Proves DoD #4,#5,#6,#8,#9,#10,#13. **Currently passing (13/13).**
- `scripts/tests/lib/governance.ts` — pure static-analysis checks (no-bypass, no-duplicate-artefact).
- `supabase/functions/_shared/hmrc-client.test.ts` — Deno integration tests
  (run: `deno task test`). Proves DoD #8,#10,#12 against stubbed fetch/admin client.
- `scripts/tests/sprint0-enforcement.sql` — DB-level invariants (DoD #3,#4,#6,#7,#13),
  run against a live DB.

### No migrations
Sprint 0 added **no** SQL migrations. No existing core table was modified,
renamed, dropped, or had its workflow altered.

---

## 6. Definition of Done — status
| # | Criterion | Status |
|---|---|---|
| 1 | Hello World succeeds through the proxy | Path implemented (`action:"hello_world"`); requires live HMRC sandbox to execute |
| 2 | Proxy tests prove fraud-prevention headers attached | ✅ `verify-sprint0` (merge) + `hmrc-client.test.ts` (outbound request) |
| 3 | Audit records redact all secrets | ✅ `redaction.ts` + tests (unit + call-site) |
| 4 | Approval-gate enforcement exists | ✅ DB `validate_filing_submission()` (reused) + engine `assertProjectionAllowed` + tests |
| 5 | No projection without an approved artefact | ✅ `assertProjectionAllowed` + test |
| 6 | No submission without a projection | ✅ `assertSubmissionAllowed` + test |
| 7 | Tenant isolation proven | ⏳ pattern + SQL/JWT harness (needs live DB); reuses `user_has_organization_access` |
| 8 | Proxy attaches fraud-prevention headers | ✅ |
| 9 | No HMRC calls bypass proxy | ✅ enforced for new code; 7 legacy callers tracked as Known Debt |
| 10 | Audit redacts secrets | ✅ |
| 11 | OAuth token isolation works | Reuses existing per-org token storage + refresh; redaction proven |
| 12 | Hello World call is audited | ✅ `hmrc-client.test.ts` asserts audit row |
| 13 | No parallel approval artefact created | ✅ none created; consuming existing spine; enforced by test |

"✅" = proven by an executed test (`bun run test:sprint0`, 13/13 green).
"⏳" = authored test requiring a live DB/HMRC sandbox to execute in CI/staging.

---

## 7. Known Debt (tracked, NOT Sprint 0 scope)
- Legacy HMRC callers still call HMRC directly and must be migrated onto
  `hmrc-call-proxy` in a follow-up sprint:
  `hmrc-vat-submit`, `hmrc-vat-obligations`, `hmrc-ct-submit`, `hmrc-ct-poll`,
  `hmrc-ct-delete`, `rti-submit`, `cis-submit` (allowlisted in
  `scripts/tests/lib/governance.ts` so a NEW direct caller fails the build).
- Vault adoption for token storage (deferred by decision).
- Live HMRC sandbox round-trip (needs sandbox credentials + MTD IT test user).

## 8. Risks
- **Security:** fraud-prevention completeness depends on the browser sending all
  signals; the server logs (does not block) when required headers are missing.
  Live `Gov-*` adequacy must be validated against HMRC's "Test Fraud Prevention
  Headers" API before production.
- **Architecture:** until the legacy callers are migrated, "no bypass" is enforced
  only for new code. The governance test bounds the debt and prevents growth.
- **Migration:** none introduced; risk is deferred to the follow-up migration sprint.
- **Operational:** the proxy is a new single point through which all new HMRC
  traffic flows; it reuses existing rate-limit/idempotency primitives and must
  inherit them when legacy traffic is migrated.

## 9. How to run
```bash
bun run test:sprint0        # runtime-agnostic logic + governance invariants (runs today)
deno task test              # Deno edge integration tests (CI)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/tests/sprint0-enforcement.sql  # DB invariants
```
