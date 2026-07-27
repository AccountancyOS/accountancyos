## Goal

Return the Blue Tick tenant to a genuinely empty state for client-side data, and free up every client email address so onboarding can be re-tested from scratch with the same details.

## What is actually there right now (verified live)

Tenant `Blue Tick Accountants & Tax Advisers LLP`:

| Data | Count | Notes |
|---|---|---|
| Leads | 2 | Churchills London Ltd, Bassage Eyes Ltd |
| Clients | 2 | Portal A, Portal B (QA fixtures) |
| Companies | 4 | Portal C1, C2, D (fixtures) + Churchills |
| Quotes | 2 | Q-26-0001, Q-26-0002 |
| Onboarding applications | 1 | Churchills |
| Engagement letters | 1 | draft |
| Engagements / Jobs / Deadlines | 5 / 5 / 5 | all from the Churchills approval |
| Portal access rows | 6 | 5 fixtures + 1 invited (leon5440@hotmail.com) |

Login-side leftovers — this is what causes the duplicate and "database error checking email" problems:

- `leon5440@hotmail.com` — a live login **plus** a second, broken half-record whose owning account no longer exists. Any new signup for that address hits the broken record and returns a 500.
- `amyleestevens7@gmail.com` — a login account with **no** sign-in record attached (the mirror-image breakage), left over from the earlier portal-b collision.
- Four portal QA logins (`portal-a`, `portal-b`, `portal-b-qa`, `portal-c`, `portal-d`).

Your practice login `leon@bluetickaccountants.com` and `thetaxteam@bluetickaccountants.com` are separate and stay untouched.

## Plan

### 1. Wipe all client-side tenant data
Reuse the proven org-scoped reset already in the repo (`20260724150000_reset_bluetick_test_client_data.sql`) as a one-off data operation, scoped to organisation `a857a12c-…`. It removes leads, clients, companies, contacts, quotes and quote tokens, onboarding applications and documents, engagement letters and signatories, engagements, jobs and job artefacts, deadlines, invoices, portal access, notifications, email queue rows, SLA instances and automation events — in foreign-key-safe order.

Preserved: organisation, org settings, your team users, services catalog, canonical templates and rules, message/EL templates, automation configuration, rate tables and the master chart of accounts. `audit_log` is kept for the trail.

### 2. Delete every client-side login
Remove the login accounts and all their sign-in records for:
- `leon5440@hotmail.com` (live account **and** the broken half-record)
- `amyleestevens7@gmail.com` (the account with no sign-in record)
- `portal-a@…`, `portal-b@…`, `portal-b-qa@…`, `portal-c@…`, `portal-d@…` test fixtures

Afterwards, run an integrity check confirming zero mismatched login records remain — that is the specific condition that produced "database error checking email".

### 3. Verify clean
Re-run counts for the tenant: leads, clients, companies, quotes, onboarding applications, engagement letters, engagements, jobs, deadlines and portal access all zero; practice config counts unchanged. Report the before/after table back to you.

### 4. Record it
Write a release receipt under `docs/releases/` covering both the data wipe and the login cleanup, with the verification results — consistent with your production-release convention, since this is a Lovable-executed production data change rather than a Git-pinned deployment.

### Notes / technical

- Nothing here is a schema change, so no new migration file and no change to the pending migration batch. It runs as data operations against live.
- **Irreversible.** Take a snapshot first if you want any of the current Churchills data back.
- The portal QA fixtures (Portal A–D) disappear with this. They can be re-created any time with the existing `seed-portal-test-users` function; `docs/test-fixtures.md` will need its note about the retired `portal-b@` address updated once the stale login is gone.
- After this you can onboard Churchills again using `leon5440@hotmail.com` from the very beginning, including the client portal signup.
