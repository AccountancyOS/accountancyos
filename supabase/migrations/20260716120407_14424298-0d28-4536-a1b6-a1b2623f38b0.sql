
CREATE OR REPLACE FUNCTION public.mcp_list_schema()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(table_name, cols), '{}'::jsonb)
  FROM (
    SELECT c.table_name,
           jsonb_agg(jsonb_build_object(
             'column', c.column_name,
             'type', c.data_type,
             'nullable', c.is_nullable = 'YES',
             'default', c.column_default
           ) ORDER BY c.ordinal_position) AS cols
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    GROUP BY c.table_name
  ) s;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_schema() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_schema() TO authenticated;
