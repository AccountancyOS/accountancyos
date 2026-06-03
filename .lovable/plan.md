## Two fixes on the Client (Company) detail page

### 1) UTR and Companies House Auth Code are read-only

On `CompanyDetail.tsx`, the "Company Information" card shows `UTR` and `Auth Code` as plain text with no edit affordance — the only inline edit on this card is Year End. There is no dialog or input wired to update `companies.utr`, `companies.auth_code`, or `companies.companies_house_auth_code`.

**Fix:** Add an inline edit control (small pencil button, same pattern as Year End) next to UTR and Auth Code. Clicking opens a tiny popover/dialog with a single text input and Save/Cancel. On save, `update companies set utr = ...` (or `auth_code = ...`) where `id = company.id`, then invalidate the `company` query. Light validation only (UTR: 10 digits; Auth Code: 6 alphanumeric — non-blocking warnings, not hard rejects, because formats vary).

### 2) Partner / Staff dropdowns are empty even though the owner exists

`StaffAssignmentField` queries:

```ts
supabase.from("organization_users").select("user_id, role, profiles(first_name, last_name, email)")
```

But there is **no `profiles` table** in this project (confirmed against `information_schema`). The embedded join fails, the query throws, React Query swallows it, and the dropdown renders only "Unassigned". The same broken pattern exists in `PermissionsSettings.tsx`, `MyProfileSettings.tsx`, `StaffVarianceTable.tsx`, `WorkpaperDiffView.tsx`, `audit-service.ts`, `workflow-step-executor.ts`, and `app-context.tsx` — so the team page, "my profile", staff variance dashboard etc. are all silently nameless too.

**Fix (one migration, then point existing code at it):**

1. Create `public.profiles`:
   - `id uuid primary key references auth.users(id) on delete cascade`
   - `email text`, `first_name text`, `last_name text`, `avatar_url text`
   - `created_at`, `updated_at` with the standard trigger
   - GRANTs: `select` to `authenticated`; `update` to `authenticated` (own row only); `all` to `service_role`
   - RLS: every authenticated user can `select` any profile inside their organization (joined via `organization_users`), and `update` only their own row.

2. Trigger `on auth.users insert` → insert into `public.profiles` using `raw_user_meta_data->>'first_name'`, `last_name`, plus `email`. Trigger `on auth.users update of email` → keep `profiles.email` in sync.

3. Backfill: insert one row per existing `auth.users` row that isn't already in `profiles`, pulling names from `raw_user_meta_data` and falling back to email.

4. Leave the existing component queries alone — `profiles:user_id ( ... )` will start resolving once the table exists with a matching FK, so the dropdowns, team page, my-profile page, and staff variance table all start showing real names with no further code changes.

5. While verifying, make `StaffAssignmentField` show only `partner`/`owner`/`admin` roles in the "Partner in Charge" dropdown and all roles in "Staff in Charge" (so the owner who set up the practice automatically appears as a valid Partner option — that's the specific case the user hit).

### Technical notes

- No edge function changes.
- No changes to `companies` schema (UTR and both auth-code columns already exist).
- Single migration for the `profiles` table + trigger + backfill + RLS + grants.
- Frontend edits limited to `src/pages/CompanyDetail.tsx` (add the two inline edits) and `src/components/company/StaffAssignmentField.tsx` (filter roles for the Partner field).

### Verification before declaring done

- Re-query `profiles` and confirm one row per `auth.users` row.
- Open Company → Practice Management: Partner in Charge dropdown lists the owner.
- Assign a partner, reload page, confirm persistence.
- Edit UTR inline, reload, confirm persistence; same for Auth Code.
- Team page (`PermissionsSettings`) shows real names instead of "Unknown".
