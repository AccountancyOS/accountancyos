

# Full-Stack Testing Plan for AccountancyOS

This plan uses every testing tool available: browser automation, edge function curl testing, database queries, analytics logs, the security linter, and console/network inspection. No code changes are needed — this is a live validation pass.

---

## Phase 1 — Security & Database Integrity

**Step 1: Run Security Scan**
- Execute the security scanner to detect exposed data, missing RLS policies, and misconfigurations across all tables.

**Step 2: Run Database Linter**
- Run the Supabase linter to check for tables without RLS, overly permissive policies, and missing constraints.

**Step 3: Verify Schema & Data**
- Query key tables (`organizations`, `organization_users`, `clients`, `jobs`, `filings`, `automation_rules`, `contacts`, `crm_activities`, `bookkeeping_audit_log`) to confirm they exist, have data, and columns match expectations (e.g. `nino`, `utr`, `dob` on contacts; role CHECK constraint on org_users).

**Step 4: Check RLS Role Enforcement**
- Query `organization_users` to confirm only `owner`, `admin`, `staff` roles exist (no legacy `manager`/`viewer`).

---

## Phase 2 — Edge Function Smoke Tests

Curl each critical edge function to verify deployment and basic response:

- `gdpr-data-export` (POST) — expect 401 or auth error (no token)
- `gdpr-data-deletion` (POST) — expect 401 or auth error
- `process-automation-events` (POST) — confirm deployed
- `sla-check` (POST) — confirm deployed
- `stripe-webhook` (POST) — confirm deployed
- `hmrc-ct-submit` (POST) — confirm deployed
- `send-email` (POST) — confirm deployed
- `workflow-tick` (POST) — confirm deployed

Check edge function logs for any recent errors across key functions.

---

## Phase 3 — Authentication Flow (Browser)

**Step 1: Navigate to `/auth`**
- Screenshot the login page. Verify sign-in form, sign-up form, Google OAuth button, and forgot password link all render.

**Step 2: Test invalid login**
- Attempt login with invalid credentials. Verify error toast appears.

**Step 3: Test Google OAuth button**
- Click "Sign in with Google" and verify it initiates the OAuth redirect (or shows the Google consent screen).

**Step 4: Test password reset flow**
- Click "Forgot password", enter an email, verify success message appears.

---

## Phase 4 — Authenticated App Walkthrough (Browser)

Requires the user to be logged in first. After login:

**Step 1: Dashboard (`/overview`)**
- Verify KPI cards render (Active Clients, Pipeline Leads or My Jobs depending on role).
- Verify Fee Aggregation panel renders for owner/admin.
- Verify Overdue Actions panel renders.

**Step 2: CRM (`/crm`)**
- Verify leads table loads. Click a lead to open detail panel.
- Verify Activity Timeline tab is present and functional.

**Step 3: Clients (`/clients`)**
- Verify client list loads.
- Navigate to a client portal page. Verify tabs (Overview, Services, HMRC Authorisation, Engagement Letter status) render.

**Step 4: Jobs (`/jobs`)**
- Verify jobs table loads with status badges.
- Click into a job detail page. Verify status, deadlines, and filings sections render.

**Step 5: Filings (`/filings`)**
- Verify filings list loads. Click a filing to verify detail page renders.

**Step 6: Settings (`/settings`)**
- Verify settings page loads. Check that GDPR Compliance panel is visible (owner only).
- Verify team/permissions section renders.

**Step 7: Automations (`/automations`)**
- Verify automation rules list loads.

---

## Phase 5 — Console & Network Validation

After the browser walkthrough:

**Step 1:** Read browser console logs — check for errors, warnings, or failed API calls.

**Step 2:** List network requests — verify no 4xx/5xx responses from API calls during navigation.

**Step 3:** Check auth logs via analytics query — confirm no auth errors in recent requests.

**Step 4:** Check Postgres logs via analytics query — confirm no database errors.

---

## Phase 6 — State Machine & E2E Flow Validation

The project already has `src/lib/e2e-flow-validation.ts` with state machine definitions. During the browser session, navigate to a page that can trigger these (or test via console):

- Verify job state transitions follow the defined state machine.
- Verify filing state transitions are enforced.

---

## Summary of Tools Used

| Tool | Purpose |
|------|---------|
| `security--run_security_scan` | Full security audit |
| `supabase--linter` | RLS & schema checks |
| `supabase--read_query` | Data verification |
| `supabase--curl_edge_functions` | Edge function smoke tests |
| `supabase--edge_function_logs` | Error log inspection |
| `supabase--analytics_query` | Auth & DB log analysis |
| `browser--navigate_to_sandbox` | UI navigation |
| `browser--observe` / `browser--act` | UI interaction |
| `browser--screenshot` | Visual verification |
| `browser--read_console_logs` | Frontend error detection |
| `browser--list_network_requests` | API health check |

---

## What You Need To Do

You will need to be **logged in** to the preview app before Phase 4 begins. I will prompt you when that step arrives. Everything else runs automatically.

