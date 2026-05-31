-- 1. Guard: abort if any user (other than the known stuck one) has multiple memberships
DO $$
DECLARE
  extra_dupes int;
BEGIN
  SELECT count(*) INTO extra_dupes FROM (
    SELECT user_id FROM public.organization_users
    WHERE user_id <> '968f4acc-f7ba-40ce-9735-3deb11835442'
    GROUP BY user_id HAVING count(*) > 1
  ) t;
  IF extra_dupes > 0 THEN
    RAISE EXCEPTION 'Unexpected duplicate memberships found beyond the known Leon account; aborting.';
  END IF;
END $$;

-- 2. Verify the duplicate org has no business data (only org_settings auto-created via trigger).
--    We hard-check the most common tenant-scoped tables; abort if any have rows.
DO $$
DECLARE
  v_table text;
  v_count int;
  v_problem_tables text := '';
BEGIN
  FOR v_table IN
    SELECT unnest(ARRAY[
      'clients','companies','leads','quotes','engagements','jobs','job_tasks',
      'deadlines','invoices','bills','customers','suppliers','contacts',
      'bookkeeping_accounts','journals','ledger_entries','bank_accounts',
      'bank_transactions','vat_returns','filings','workpaper_instances',
      'employees','pay_runs','payslips','automation_rules','email_messages',
      'connected_mailboxes','services_catalog','templates','audit_log',
      'engagement_letters','onboarding_applications','team_invitations',
      'user_roles','portal_access','company_persons','crm_activities',
      'lead_activities','client_messages','client_tasks','notifications'
    ])
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', v_table)
      INTO v_count USING 'ccbbc75a-a477-44b7-8a9c-3efc30e1ad4d'::uuid;
    IF v_count > 0 THEN
      v_problem_tables := v_problem_tables || v_table || '(' || v_count || ') ';
    END IF;
  END LOOP;
  IF v_problem_tables <> '' THEN
    RAISE EXCEPTION 'Duplicate org has dependent data, aborting: %', v_problem_tables;
  END IF;
END $$;

-- 3. Delete the duplicate organisation. org_settings and organization_users
--    cascade automatically (confdeltype = 'c').
DELETE FROM public.organizations
 WHERE id = 'ccbbc75a-a477-44b7-8a9c-3efc30e1ad4d';

-- 4. Enforce one organisation per user at the database layer.
ALTER TABLE public.organization_users
  ADD CONSTRAINT organization_users_user_id_unique UNIQUE (user_id);

-- 5. Rewrite create_organization_with_owner: idempotent, race-safe.
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(org_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  existing_org uuid;
  new_org uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Fast-path: already a member of an org — return it.
  SELECT organization_id INTO existing_org
    FROM public.organization_users
   WHERE user_id = uid
   ORDER BY created_at ASC
   LIMIT 1;

  IF existing_org IS NOT NULL THEN
    RETURN existing_org;
  END IF;

  -- Create new org.
  INSERT INTO public.organizations (name)
    VALUES (COALESCE(NULLIF(trim(org_name), ''), 'My Practice'))
    RETURNING id INTO new_org;

  -- Insert membership; if a parallel call won the race, the unique
  -- constraint will fire — drop our org and return the winning one.
  BEGIN
    INSERT INTO public.organization_users (organization_id, user_id, role)
      VALUES (new_org, uid, 'owner');
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM public.organizations WHERE id = new_org;
    SELECT organization_id INTO existing_org
      FROM public.organization_users
     WHERE user_id = uid
     ORDER BY created_at ASC
     LIMIT 1;
    RETURN existing_org;
  END;

  RETURN new_org;
END;
$$;