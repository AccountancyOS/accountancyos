
REVOKE EXECUTE ON FUNCTION public.mcp_list_functions(text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mcp_list_triggers(text)          FROM anon;
REVOKE EXECUTE ON FUNCTION public.mcp_list_policies(text)          FROM anon;
REVOKE EXECUTE ON FUNCTION public.mcp_list_grants(text)            FROM anon;
REVOKE EXECUTE ON FUNCTION public.mcp_list_rls_status(text)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.mcp_list_indexes(text)           FROM anon;
REVOKE EXECUTE ON FUNCTION public.mcp_list_cron_jobs()             FROM anon;
