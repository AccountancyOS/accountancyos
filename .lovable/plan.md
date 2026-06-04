# Portal QA / Security Regression Pass

No new features. Goal: prove the migrated portal under `src/portal/*` is safe, correctly scoped, and free of stubbed behaviour before any further build work.

## Scope rules

- Read-only investigation across `src/portal/`, `src/App.tsx`, accountant routes, RPCs, and RLS.
- Code fixes only for **critical security / data-isolation / auth bugs** discovered during QA. Anything else goes into the issue register, not into a patch.
- No new modules, no new UI, no schema changes unless required to close a critical finding.

## Workstreams

### 1. Route & app boundary audit (static)
- Diff `src/App.tsx` and confirm only `/portal/*` was added; accountant routes untouched.
- `rg` for cross-imports: `src/portal/**` importing from accountant src (other than `@/integrations/supabase/client`, generated types, shared primitive UI), and accountant src importing from `src/portal/**` (must be zero).
- Confirm `PortalGuard` blocks accountant-only users and vice versa; check fallback routes (`PortalNotFound`, accountant 404).

### 2. Auth & portal access (live)
- Use the preview browser to walk: login (valid, invalid, accountant-without-portal, revoked, no `portal_access`), invite (valid, expired, invalid, already accepted, existing user), password reset, password change, logout.
- Confirm loading states resolve, no silent hangs, toasts on every failure path.

### 3. Data isolation (live + DB)
- Seed/identify test users A, B, C (multi-entity), revoked, accountant-no-portal via `supabase--read_query`.
- For each portal module, attempt cross-tenant access via: direct URL, query params, `localStorage` active-entity tampering, ID swap in network calls, reused signed URLs.
- Modules covered: tasks, documents (+ signed URLs), questionnaires, messages, payments, financial summaries, bookkeeping, entity switcher.

### 4. Per-module functional QA (live)
Dashboard, Tasks, Documents, Messages, Questionnaires, Payments, Financials/Bookkeeping, Settings — verified against the checklist in the request (real data, scoping, empty/error states, no fake actions, no unsafe write paths, visibility flags honoured).

### 5. RPC & RLS review (DB)
- Read `portal_send_message` definition; verify SECURITY DEFINER guards (auth.uid, active `portal_access`, scope match, forced `sender_type='client'` and `visibility='client_visible'`, audit fields, invalid-id handling).
- For each portal-touched table (`portal_access`, `clients`, `companies`, `client_tasks`, `job_documents`, `questionnaire_files`, `engagement_letters`, `onboarding_documents`, `client_messages`, `invoices`, `invoice_payments`, `trial_balance_snapshots`, `portal_visibility_settings`, `questionnaire_instances`) pull policies via `supabase--read_query` on `pg_policies` and classify each policy as safe / over-broad / missing.
- Run `supabase--linter` and triage findings relevant to portal surface.
- Check storage bucket policies for any bucket served via signed URLs from portal.

### 6. Stub / fake behaviour audit (static)
- `rg` in `src/portal/` for: `TODO|FIXME|mock|stub|placeholder|as any|hardcoded|fake|truelayer|console\.log`, empty `onClick={() => {}}`, disabled-but-visible CTAs, references to retired schema/edge functions/project IDs, bookkeeping write calls.
- Classify each hit: safe temporary stub / must-fix / remove / backlog.

### 7. Mobile smoke (live)
- Use `preview_ui--set_preview_device_viewport` at a phone size and walk login, invite, dashboard, sidebar, entity selector, tasks, documents, messages, settings. Flag layout blockers only.

### 8. Critical-bug fix loop
- Only if Workstreams 2/3/5/6 surface a security, auth, data-isolation, or fake-functionality issue rated Critical or High: apply the minimum patch (code or migration) to close it, re-test, and record before/after in the report.
- All Medium/Low findings → issue register only.

## Deliverable

A single Markdown QA report saved to `/mnt/documents/portal-qa-report.md` and surfaced via `<presentation-artifact>`, with these sections exactly as requested:

1. Executive Summary (status, production readiness, critical blockers, high-risk issues, safe-for-internal-testing verdict).
2. Regression Results table (Area / Result / Evidence / Issues).
3. Security & Data-Isolation Results table (Test / Result / Evidence / Issue).
4. RLS / RPC Review table (Object / Status / Risk / Required Fix).
5. Issue Register (Severity / Module / Issue / Evidence / Required Fix).
6. Safe-to-Use Verdict — one of: Not safe / Safe for internal testing only / Safe for selected client beta / Production-ready. Production-ready only if zero Critical/High in security, auth, data isolation, or fake functionality.

Chat reply will summarise verdict, top blockers, and link the report artifact. No new feature work will start until you accept the report.

## Technical notes

- Investigation tools: `code--view`, `rg`, `supabase--read_query`, `supabase--linter`, `browser--*` for live flows, `preview_ui--set_preview_device_viewport` for mobile.
- Test accounts: prefer existing seeded "Greenfield & Co" practice users; if portal test users A/B/C don't exist, I'll list what's in `portal_access` and ask you to confirm which to use before doing live cross-tenant probing (so we don't poke real client data).
- Destructive probes (sending messages, accepting invites) will be done only against test rows, and noted in the report.