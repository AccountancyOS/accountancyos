## Regression Prevention System

A permanent safety net to catch drift in auth emails, portal access, queues, RLS, onboarding, questionnaires, jobs, and filings before users hit them. Layered: docs → manifest → smoke probe → automated tests → checklist.

The project today has zero `*.test.*` files, no Vitest config, and no CI workflows. There are already two relevant edge functions (`portal-qa-probe`, `seed-portal-test-users`) we can extend rather than rebuild.

---

### 1. Critical Workflows Documentation

Create `docs/critical-workflows.md` with one section per workflow, each covering: frontend entry point, backend RPCs/edge functions, tables touched, RLS assumptions, external providers, expected state transitions and logs, and known failure modes.

Workflows covered:

```text
- Accountant login                          - Email queue processing
- Client portal login                       - Deadline / job generation
- Client forgotten password                 - TrueLayer connect + sync
- Client invitation (portal_access)         - Bookkeeping transaction posting
- Quote accepted -> client -> onboarding    - Workpaper approval / locking
- Engagement letter send + sign             - Filing submission state machine
- Questionnaire send                        - RLS cross-organization isolation
- Questionnaire completion -> job update
```

### 2. Supabase Infrastructure Manifest

Create `infra/supabase-manifest.json` as the source of truth for expected backend infrastructure, plus a human-readable `docs/supabase-infrastructure.md`. Manifest declares:

- Required edge functions (full list, with `verify_jwt` expectation)
- Required cron jobs (`process-email-queue`, `chaser-tick`, `sla-check`, `session-cleanup`, `workflow-tick`, `dormant-lead-scan`, `invoice-overdue-scan`, `truelayer-sync-scheduled`)
- Required runtime secrets (Stripe, HMRC, Companies House, TrueLayer, Gmail/Outlook OAuth, `LOVABLE_API_KEY`)
- Required public-schema tables that must have RLS enabled
- Required email infrastructure (`email_send_log`, `email_send_state`, `suppressed_emails`, `enqueue_email` RPC, pgmq queues `auth_emails` + `transactional_emails`)
- Required storage buckets
- Required auth config: Site URL, allow-listed redirects (including `https://app.accountancyos.com/portal/reset-password`), auth-email hook wiring

### 3. Post-Deploy Smoke Test Script

Create `scripts/smoke-test.ts` (runnable with `bun scripts/smoke-test.ts`) that reads the manifest and verifies against the live backend:

- Every manifest edge function is deployed and reachable (HEAD/OPTIONS)
- Every manifest cron job exists in `cron.job`
- Every manifest table exists and has RLS enabled
- Email queue: enqueues a synthetic test email and confirms `email_send_log` reaches `sent` within 30s
- Auth hook: triggers a recovery for a dedicated test user and asserts `auth-email-hook` ran and `email_send_log` recorded a `recovery` send
- Reset URL: confirms `/portal/reset-password` resolves on the deployed portal
- Required secrets present (`fetch_secrets` comparison)
- RLS probe: runs the existing `portal-qa-probe` and a new cross-org probe

Exits non-zero with a clear report when any check fails. Designed to be CI-runnable and locally runnable.

### 4. Automated Regression Tests

Install Vitest + Testing Library (the project has none today). Configure `vitest.config.ts`, `src/test/setup.ts`, add `"test"` script to `package.json`.

First-wave tests (covering the highest-risk paths):

- `PortalForgotPassword.test.tsx` - asserts the component calls `resetPasswordForEmail` with the correct `redirectTo` and shows enumeration-safe success
- `PortalLogin.test.tsx` - happy path + error path
- Email queue contract test - validates the auth-email-hook payload shape and `enqueue_email` arguments via a mocked Supabase client
- Questionnaire send + completion - service layer test that completion writes job update
- Quote acceptance lifecycle - service layer test for `acceptQuote -> create client -> start onboarding`
- RLS cross-org isolation - integration test using the `seed-portal-test-users` fixture (Org A and Org B) verifying users in one org cannot read the other's clients/jobs

### 5. Test Fixtures and Seed Data

Extend `seed-portal-test-users` to provision a deterministic fixture set used by tests and smoke checks:

```text
- regression+accountant@accountancyos.test
- regression+client.active@accountancyos.test       (portal access active)
- regression+client.noportal@accountancyos.test     (no portal access)
- regression+client.revoked@accountancyos.test      (portal access revoked)
- regression+client.company@accountancyos.test      (limited company)
- regression+client.sole@accountancyos.test         (sole trader)
- regression+orgA.owner@accountancyos.test + regression+orgB.owner@accountancyos.test  (RLS isolation)
```

Document them in `docs/test-fixtures.md`. Real users (e.g. Amy) are explicitly excluded from automated tests.

### 6. Development Guardrails

Add `docs/change-checklist.md` plus a `## Change Checklist` block prepended to `README.md`. Every future change must record:

- Impact analysis (which workflows from `critical-workflows.md` are affected)
- Tests added / run
- Migration safety check (idempotent? backfill? RLS still enforced?)
- RLS / security check
- Edge function deploy check
- Smoke test pass (or why skipped)

Add `.github/PULL_REQUEST_TEMPLATE.md` mirroring the checklist so it appears on every PR.

### 7. Implementation Order

```text
1. critical-workflows.md + supabase-infrastructure.md + manifest JSON
2. Vitest setup + first-wave tests
3. Extend seed-portal-test-users for full fixture set + test-fixtures.md
4. scripts/smoke-test.ts wired to manifest + extended portal-qa-probe
5. change-checklist.md + README block + PR template
6. Run smoke script + tests; record results in the new docs as the baseline
```

### Technical Details

- Test runner: Vitest 3.x with jsdom + Testing Library, mirroring the prompt-provided frontend testing setup. No Playwright (out of scope for first wave; can be layered later).
- Smoke script auth: uses anon key for public probes; uses a dedicated `REGRESSION_SERVICE_KEY` runtime secret for RLS checks. We will request that secret via `add_secret` only if the user approves the plan.
- Cron + table introspection in smoke script uses `supabase.rpc` against existing read-only helper functions; no destructive SQL.
- Manifest format kept as JSON so it is machine-checkable and easy to diff in PRs.
- RLS test strategy: two seeded org owners + signed-in PostgREST calls; assert cross-org `select` returns zero rows and cross-org `update/insert` returns 401/403.
- No changes to existing business logic or live data in this work - this is purely additive infrastructure.

### Acceptance

- `docs/critical-workflows.md`, `docs/supabase-infrastructure.md`, `docs/test-fixtures.md`, `docs/change-checklist.md` exist and are complete
- `infra/supabase-manifest.json` exists and matches live infra
- `scripts/smoke-test.ts` runs green against current deployment and fails loud when a required piece is missing (proven by toggling a check)
- Vitest installed; first-wave tests pass; `bun test` runs them
- Forgotten-password path is covered by both a Vitest test (frontend wiring) and the smoke script (end-to-end)
- PR template + README checklist in place
