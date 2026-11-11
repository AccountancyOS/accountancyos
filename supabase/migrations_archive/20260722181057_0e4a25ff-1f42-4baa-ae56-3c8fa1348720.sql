
CREATE OR REPLACE FUNCTION public.mcp_list_functions(
  name_like text DEFAULT NULL,
  include_source boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.name), '[]'::jsonb)
  FROM (
    SELECT
      n.nspname                                     AS schema,
      p.proname                                     AS name,
      pg_get_function_identity_arguments(p.oid)     AS arguments,
      pg_get_function_result(p.oid)                 AS return_type,
      l.lanname                                     AS language,
      p.prosecdef                                   AS security_definer,
      CASE p.provolatile WHEN 'i' THEN 'immutable' WHEN 's' THEN 'stable' WHEN 'v' THEN 'volatile' END AS volatility,
      (
        SELECT string_agg(cfg, ', ')
        FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )                                             AS search_path,
      md5(pg_get_functiondef(p.oid))                AS definition_hash,
      CASE WHEN mcp_list_functions.include_source
           THEN pg_get_functiondef(p.oid)
           ELSE NULL END                            AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language  l ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (mcp_list_functions.name_like IS NULL
           OR p.proname ILIKE '%' || mcp_list_functions.name_like || '%')
  ) t;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_functions(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_functions(text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mcp_list_triggers(table_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t."table", t.name), '[]'::jsonb)
  FROM (
    SELECT
      n.nspname                              AS schema,
      c.relname                              AS "table",
      tg.tgname                              AS name,
      CASE WHEN (tg.tgtype & 2) = 2 THEN 'BEFORE'
           WHEN (tg.tgtype & 64) = 64 THEN 'INSTEAD OF'
           ELSE 'AFTER' END                  AS timing,
      array_remove(ARRAY[
        CASE WHEN (tg.tgtype & 4)  = 4  THEN 'INSERT' END,
        CASE WHEN (tg.tgtype & 8)  = 8  THEN 'DELETE' END,
        CASE WHEN (tg.tgtype & 16) = 16 THEN 'UPDATE' END,
        CASE WHEN (tg.tgtype & 32) = 32 THEN 'TRUNCATE' END
      ], NULL)                               AS events,
      pn.nspname                             AS function_schema,
      p.proname                              AS function_name,
      tg.tgenabled <> 'D'                    AS enabled,
      pg_get_triggerdef(tg.oid)              AS definition
    FROM pg_trigger tg
    JOIN pg_class     c  ON c.oid  = tg.tgrelid
    JOIN pg_namespace n  ON n.oid  = c.relnamespace
    JOIN pg_proc      p  ON p.oid  = tg.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE NOT tg.tgisinternal
      AND n.nspname = 'public'
      AND (mcp_list_triggers.table_name IS NULL OR c.relname = mcp_list_triggers.table_name)
  ) t;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_triggers(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_triggers(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mcp_list_policies(table_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t."table", t.name), '[]'::jsonb)
  FROM (
    SELECT
      pp.schemaname  AS schema,
      pp.tablename   AS "table",
      pp.policyname  AS name,
      pp.permissive,
      pp.roles,
      pp.cmd,
      pp.qual,
      pp.with_check
    FROM pg_policies pp
    WHERE pp.schemaname = 'public'
      AND (mcp_list_policies.table_name IS NULL OR pp.tablename = mcp_list_policies.table_name)
  ) t;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_policies(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_policies(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mcp_list_grants(table_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t."table", t.grantee, t.privilege), '[]'::jsonb)
  FROM (
    SELECT
      g.table_schema   AS schema,
      g.table_name     AS "table",
      g.grantee,
      g.privilege_type AS privilege,
      g.is_grantable
    FROM information_schema.role_table_grants g
    WHERE g.table_schema = 'public'
      AND g.grantee IN ('anon','authenticated','service_role','postgres')
      AND (mcp_list_grants.table_name IS NULL OR g.table_name = mcp_list_grants.table_name)
  ) t;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_grants(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_grants(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mcp_list_rls_status(table_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t."table"), '[]'::jsonb)
  FROM (
    SELECT
      n.nspname             AS schema,
      c.relname             AS "table",
      c.relrowsecurity      AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND (mcp_list_rls_status.table_name IS NULL OR c.relname = mcp_list_rls_status.table_name)
  ) t;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_rls_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_rls_status(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mcp_list_indexes(table_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t."table", t.name), '[]'::jsonb)
  FROM (
    SELECT
      n.nspname                          AS schema,
      c.relname                          AS "table",
      ic.relname                         AS name,
      i.indisunique                      AS is_unique,
      i.indisprimary                     AS is_primary,
      (i.indpred IS NOT NULL)            AS is_partial,
      pg_get_expr(i.indpred, i.indrelid) AS predicate,
      (
        SELECT array_agg(a.attname ORDER BY k.ord)
        FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
      )                                  AS columns,
      pg_get_indexdef(i.indexrelid)      AS definition
    FROM pg_index i
    JOIN pg_class    c  ON c.oid  = i.indrelid
    JOIN pg_class    ic ON ic.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid  = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND (mcp_list_indexes.table_name IS NULL OR c.relname = mcp_list_indexes.table_name)
  ) t;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_indexes(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_indexes(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mcp_list_cron_jobs()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  result jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    EXECUTE $q$
      SELECT coalesce(jsonb_agg(row_to_json(j) ORDER BY j.jobname), '[]'::jsonb)
      FROM (
        SELECT jobid, schedule, jobname, command, active, database, username
        FROM cron.job
      ) j
    $q$ INTO result;
    RETURN coalesce(result, '[]'::jsonb);
  END IF;
  RETURN '[]'::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_cron_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_cron_jobs() TO authenticated, service_role;
