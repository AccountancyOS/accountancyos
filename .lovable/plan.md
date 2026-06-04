## Goal

Fully remove the Churchills London test data so the portal-invite -> signup -> acceptance flow can be exercised from a clean slate.

## What gets deleted

Identified in the DB:

- **Company**: `Churchills London Ltd` — `companies.id = b3395d8b-fa5a-45d2-99ab-bf812f56f207` (org `a857a12c-...`)
- **Client**: `Leon Stevens` (`leon5440@hotmail.com`) — `clients.id = c71e87f7-08cc-4ebe-994b-e51d05319bef`
- **Auth user**: `leon5440@hotmail.com` — `auth.users.id = ab6a0b5c-d9e4-49f2-8445-489bffcd8ef5`
- **Portal access**: `portal_access.id = 58c67301-6299-46a8-a0e7-993030e863a2` (status `invited`)
- **Contact**: `contacts` row for Leon under the company
- **Jobs**: 13 job rows tied to the company + 1 tied to the Leon client
- Any dependent rows: `job_tasks`, `job_timeline`, `job_documents`, `job_artifacts`, `job_workpaper_instances`, `job_questionnaire_instances`, `job_conversations`, `sla_instances`, `deadlines`, `engagements`, `engagement_letters`, `kyc_packs`/`kyc_pack_subjects`, `quotes`/`quote_lines`/`quote_acceptance_tokens`, `crm_activities`/`lead_activities`, `email_queue` / `email_messages` / `message_entity_links` referencing these IDs, `notifications`, `onboarding_applications`, `audit_log` rows (kept — see below).

I will run a single migration that deletes child-table rows first, then the parents, then the auth user via `auth.admin.deleteUser`-equivalent SQL (`delete from auth.users where id = ...`).

## Plan

### 1. Migration — purge child rows, then parents

One migration, wrapped in a transaction. For each child table that references either the company, the client, or the auth user, run a targeted `DELETE`. Order:

```text
portal_access
contacts
message_entity_links (linked_company_id / linked_client_id)
email_queue, email_messages
sla_instances
job_tasks, job_timeline, job_documents, job_artifacts,
  job_workpaper_instances, job_questionnaire_instances, job_conversations
jobs
deadlines
engagement_letters, engagements
quote_acceptance_tokens, quote_lines, quotes
kyc_pack_subjects, kyc_packs
crm_activities, lead_activities, leads (matching email/company)
onboarding_applications, onboarding_documents, onboarding_events
notifications
companies_house_diff_staging, company_officers, company_persons,
  company_pscs, company_register_events, company_share_*,
  company_shareholders
clients_<detail tables> for the Leon client_id
companies (Churchills row)
clients (Leon row)
auth.users (leon5440@hotmail.com)
```

For each table I'll filter by `company_id = '<churchills>'` OR `client_id = '<leon>'` as applicable. `organization_id` is **not** filtered on (we are not nuking the whole org).

`audit_log` rows are intentionally **kept** for forensic history — they don't block re-creating the company/user.

### 2. Verification queries (post-migration)

```sql
select count(*) from companies where id = 'b3395d8b-...';   -- 0
select count(*) from clients   where id = 'c71e87f7-...';   -- 0
select count(*) from auth.users where id = 'ab6a0b5c-...';  -- 0
select count(*) from portal_access where id = '58c67301-...'; -- 0
select count(*) from jobs where company_id = 'b3395d8b-...'; -- 0
```

### 3. Re-test path (after migration runs)

Re-create the client/company through the normal accountant flow, send the portal invite, and click the link from Leon's inbox — verifies the URL-safe token fix + the new `accept-portal-invite-signup` edge function end-to-end.

## Out of scope

- Schema changes (none needed).
- Touching any other client/company in the org.
- Client Portal repo edits.
- Deleting audit_log history.

## Risks

- FK chains: if a child table I haven't listed has a `RESTRICT` FK to companies/clients, the migration will error. If that happens I'll add the missing `DELETE` and re-run — no data outside the Churchills/Leon scope can be affected because every statement is filtered by the two known IDs.
