## Re-apply person-model migrations

The earlier apply calls reported success, but `SELECT array_agg(version) FROM supabase_migrations.schema_migrations` confirms neither `20260720190000` nor `20260720191000` is present on the live DB. Re-apply both in order.

## Pre-checks (already done)

- Zero duplicate `(organization_id, ch_officer_id)` rows in `company_persons` — the new unique index will build cleanly.
- Neither version is in `schema_migrations`.

## Steps

1. **Apply `20260720190000_company_profile_person_fields.sql`** — adds `companies.trading_as / primary_contact_person_id / accounts_next_made_up_to / accounts_next_due`, `company_officers.is_signatory`, `contacts.person_id`, `portal_access_unique_company_user`, `trg_enforce_signatory_rules`, and the org-scoped unique indexes on `company_persons` and `company_officers`.

2. **Apply `20260720191000_add_service_person_rpcs.sql`** — the four RPCs: `set_primary_contact`, `set_signatory`, `link_person_to_sa_client`, `grant_person_portal_access`.

3. **Verify by querying `schema_migrations`** for both versions and confirming (a) both unique indexes exist and (b) all four RPCs exist in `pg_proc`. Do not claim success from the migration-tool response alone — the last round proved that unreliable.

4. **Report back** with the actual catalog results, then you decide on the onboarding-documents security finding + publish.
