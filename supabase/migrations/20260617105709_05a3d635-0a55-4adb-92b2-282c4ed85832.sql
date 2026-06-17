
CREATE OR REPLACE FUNCTION public.seed_organization_defaults(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'org_id_required';
  END IF;

  -- Idempotent: short-circuit when catalogue already populated.
  IF EXISTS (SELECT 1 FROM public.services_catalog WHERE organization_id = p_org_id) THEN
    RETURN;
  END IF;

  -- 15 standard services (matches Greenfield seed)
  INSERT INTO public.services_catalog
    (organization_id, code, name, billing_model, default_price, is_recurring, entity_scope, active)
  VALUES
    (p_org_id, 'sa_non_mtd',             'Self-Assessment Tax Return',        'fixed',   250.00, true,  'individual', true),
    (p_org_id, 'sa_mtd',                 'Self-Assessment (MTD)',             'monthly',  35.00, true,  'individual', true),
    (p_org_id, 'company_accounts',       'Company Accounts',                  'fixed',   850.00, true,  'company',    true),
    (p_org_id, 'corporation_tax',        'Corporation Tax Return (CT600)',    'fixed',   350.00, true,  'company',    true),
    (p_org_id, 'vat_return',             'VAT Return',                        'fixed',   150.00, true,  'either',     true),
    (p_org_id, 'mtd_quarterly',          'MTD Quarterly Submission',          'fixed',    75.00, true,  'either',     true),
    (p_org_id, 'payroll',                'Payroll',                           'monthly',  25.00, true,  'either',     true),
    (p_org_id, 'pensions',               'Workplace Pensions',                'monthly',  20.00, true,  'either',     true),
    (p_org_id, 'cis',                    'CIS Returns',                       'monthly',  50.00, true,  'either',     true),
    (p_org_id, 'p11d',                   'P11D & Benefits in Kind',           'fixed',    75.00, true,  'either',     true),
    (p_org_id, 'confirmation_statement', 'Confirmation Statement (CS01)',     'fixed',    50.00, true,  'company',    true),
    (p_org_id, 'registered_office',      'Registered Office Service',         'monthly',  15.00, true,  'company',    true),
    (p_org_id, 'BOOKKEEPING',            'Bookkeeping',                       'monthly', 150.00, true,  'either',     true),
    (p_org_id, 'cgt_60_day',             'CGT 60-Day Return',                 'fixed',   350.00, false, 'individual', true),
    (p_org_id, 'advisory',               'Advisory & Consultancy',            'hourly',  150.00, false, 'either',     true);

  -- 4 starter message templates
  INSERT INTO public.message_templates
    (organization_id, channel, name, subject, body, category)
  VALUES
    (p_org_id, 'email', 'Welcome – New Client',
     'Welcome to {{practice_name}}',
     '<p>Hi {{client_first_name}},</p><p>Welcome to {{practice_name}}. We''re delighted to have you on board. Your engagement letter and onboarding pack will follow shortly.</p><p>Kind regards,<br/>{{practice_name}}</p>',
     'onboarding'),
    (p_org_id, 'email', 'Records Request',
     'Records request for {{job_name}}',
     '<p>Hi {{client_first_name}},</p><p>To prepare {{job_name}}, please send the records listed below by <strong>{{deadline_date}}</strong>.</p><p>Thank you,<br/>{{practice_name}}</p>',
     'records_request'),
    (p_org_id, 'email', 'Engagement Letter – Cover Email',
     'Your engagement letter from {{practice_name}}',
     '<p>Hi {{client_first_name}},</p><p>Please review and sign the attached engagement letter at your earliest convenience.</p><p>Kind regards,<br/>{{practice_name}}</p>',
     'engagement'),
    (p_org_id, 'email', 'Year-End Summary',
     'Your year-end summary from {{practice_name}}',
     '<p>Hi {{client_first_name}},</p><p>Your year-end review for {{period_end}} is attached. Please let us know if you have any questions.</p><p>Kind regards,<br/>{{practice_name}}</p>',
     'year_end');

  -- 3 starter chaser policies (disabled by default)
  INSERT INTO public.automation_chaser_policies
    (organization_id, service_code, name, description,
     trigger_type, trigger_offset_days,
     frequency_unit, frequency_interval,
     scope, stop_condition_type, stop_condition_value,
     is_enabled, category)
  VALUES
    (p_org_id, 'sa_non_mtd', 'Self-Assessment – Records Request Reminder',
     'Reminds clients to send Self-Assessment records before the deadline.',
     'TAX_YEAR_END', -60, 'WEEK', 2,
     'new_records', 'JOB_STATUS_EQUALS', 'records_received',
     false, 'records_request'),
    (p_org_id, 'company_accounts', 'Company Accounts – Records Request Reminder',
     'Reminds company clients to send accounts records ahead of year-end work.',
     'COMPANY_YEAR_END', -60, 'WEEK', 2,
     'new_records', 'JOB_STATUS_EQUALS', 'records_received',
     false, 'records_request'),
    (p_org_id, 'vat_return', 'VAT Return – Records Request Reminder',
     'Reminds clients to provide VAT records before each VAT period close.',
     'VAT_PERIOD_END', -14, 'WEEK', 1,
     'new_records', 'JOB_STATUS_EQUALS', 'records_received',
     false, 'records_request');
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_organization_defaults(uuid) TO authenticated, service_role;

-- Hook seeding into the existing org-creation RPC.
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(org_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  existing_org uuid;
  new_org uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT organization_id INTO existing_org
    FROM public.organization_users
   WHERE user_id = uid
   ORDER BY created_at ASC
   LIMIT 1;

  IF existing_org IS NOT NULL THEN
    RETURN existing_org;
  END IF;

  INSERT INTO public.organizations (name)
    VALUES (COALESCE(NULLIF(trim(org_name), ''), 'My Practice'))
    RETURNING id INTO new_org;

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

  -- Seed default catalogue, templates and chaser policies.
  PERFORM public.seed_organization_defaults(new_org);

  RETURN new_org;
END;
$function$;
