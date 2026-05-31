
DO $$
DECLARE
  tbl text;
  truncate_list text := '';
  extra text;
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.job_documents DISABLE TRIGGER trg_prevent_signed_document_deletion';
  EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
  END;

  FOR tbl IN
    SELECT format('%I.%I', c.table_schema, c.table_name)
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organization_id'
      AND t.table_type = 'BASE TABLE'
  LOOP
    truncate_list := truncate_list || tbl || ', ';
  END LOOP;

  FOREACH extra IN ARRAY ARRAY[
    'public.portal_access',
    'public.portal_visibility_settings',
    'public.organization_users',
    'public.organization_invitations',
    'public.user_roles',
    'public.profiles'
  ] LOOP
    IF to_regclass(extra) IS NOT NULL THEN
      truncate_list := truncate_list || extra || ', ';
    END IF;
  END LOOP;

  truncate_list := truncate_list || 'public.organizations';

  EXECUTE 'TRUNCATE TABLE ' || truncate_list || ' RESTART IDENTITY CASCADE';

  BEGIN
    EXECUTE 'ALTER TABLE public.job_documents ENABLE TRIGGER trg_prevent_signed_document_deletion';
  EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
  END;
END $$;

DELETE FROM auth.users;
