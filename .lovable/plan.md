## Pre-checks (done)

- Neither `20260720190000` nor `20260720191000` is in `schema_migrations`.
- Zero duplicate `(organization_id, ch_officer_id)` rows in `company_persons` — the new unique index will build cleanly.

## Steps

1. **Apply `20260720190000_company_profile_person_fields.sql`** — adds `companies.trading_as / primary_contact_person_id / accounts_next_made_up_to / accounts_next_due`, `company_officers.is_signatory`, `contacts.person_id`, `portal_access_unique_company_user`, `trg_enforce_signatory_rules`, and the org-scoped unique indexes on `company_persons` and `company_officers`. Verify by re-querying `schema_migrations` and confirming the two unique indexes exist.

2. **Apply `20260720191000_add_service_person_rpcs.sql`** — the four RPCs (`set_primary_contact`, `set_signatory`, `link_person_to_sa_client`, `grant_person_portal_access`). Verify in `pg_proc`.

3. **Security scan check** — call `security--get_scan_results` to confirm no critical findings block publish.

4. **Publish frontend** — ships the CRM `getStatusColor` null-guard fix (243c69b) plus the person-model panels on the company overview page, which will now have their backing columns and RPCs available.