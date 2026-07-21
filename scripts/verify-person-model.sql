-- Definition-exact catalog checks for the person-model + onboarding-security
-- releases (convention §6). Run against the LIVE database (read-only role is
-- enough) and paste the output into the release receipt as evidence. Asserting
-- a name exists is not enough — these read the actual definitions.

-- 1. CH promotion indexes must be NON-partial composite uniques (a WHERE clause
--    here would silently break supabase-js onConflict).
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in ('company_persons_org_ch_officer_uq',
                    'company_officers_company_ch_appointment_uq');
-- EXPECT: both present, "CREATE UNIQUE INDEX", columns (organization_id, ch_officer_id)
--         and (company_id, ch_appointment_id), and NO "WHERE".

-- 2. Signatory trigger must auto-demote on resignation (not RAISE) and cap at 10.
select pg_get_functiondef('public.enforce_signatory_rules'::regproc);
-- EXPECT: "NEW.is_signatory := false" on the resigned branch; RAISE only on the >= 10 cap.

-- 3. New columns with exact type / nullability / default.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('companies','trading_as'), ('companies','primary_contact_person_id'),
    ('companies','accounts_next_made_up_to'), ('companies','accounts_next_due'),
    ('company_officers','is_signatory'), ('contacts','person_id')
  )
order by table_name, column_name;
-- EXPECT: is_signatory boolean NOT NULL default false; the rest nullable; FKs as designed.

-- 4. Management RPCs present with SECURITY DEFINER and EXECUTE to authenticated.
select p.proname, p.prosecdef as security_definer,
       pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed_can_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_primary_contact','set_signatory',
                    'link_person_to_sa_client','grant_person_portal_access');
-- EXPECT: all four, security_definer = true, authed_can_exec = true.

-- 5. Onboarding-documents storage lockdown: NO anon SELECT policy; token-gated INSERT.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (qual ilike '%onboarding-documents%' or with_check ilike '%onboarding-documents%');
-- EXPECT: an INSERT policy gated on is_active_onboarding_upload_path(name); NO SELECT policy
--         for anon (reads go via the authenticated org policy / signed URLs).
