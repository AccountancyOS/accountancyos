
# Extend the app MCP with catalog introspection (revised)

## Goal

Close the gap the user hit: `db_schema` only returns tables/columns/defaults/nullability, so functions, triggers, RLS policies, grants, RLS status, cron jobs, and indexes can only be probed behaviourally. Give the MCP a read-only catalog channel so those objects can be verified by definition, not by side-effect.

## Approach

Add seven SECURITY DEFINER catalog RPCs, each returning JSON, gated to `authenticated` by explicit `EXECUTE` grant (catalog metadata is global to the project; no tenant scoping). Push filter arguments (`name_like`, `table`, etc.) into the RPCs so the DB does the filtering, not the tool. Wrap each in a new read-only MCP tool. No changes to existing tools, auth wiring, or unrelated product functionality.

## Deliverables

### 1. Migration — seven SECURITY DEFINER catalog RPCs

New file `supabase/migrations/<ts>_mcp_catalog_introspection.sql`:

RPCs (all in `public`, `STABLE SECURITY DEFINER`, `SET search_path = public, pg_catalog`, `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO authenticated, service_role`, no `anon` grant):

- `mcp_list_functions(name_like text default null, include_source boolean default false)` — `LANGUAGE sql`. Returns `[{ schema, name, arguments, return_type, language, security_definer, volatility, search_path, definition_hash, definition? }]` from `pg_proc` × `pg_namespace`, filtered to `public`. `definition_hash` = `md5(pg_get_functiondef(oid))`. `definition` returned only when `include_source = true`. `name_like` applied server-side via `proname ILIKE '%' || name_like || '%'` when non-null.
- `mcp_list_triggers(table_name text default null)` — `LANGUAGE sql`. Returns `[{ schema, table, name, timing, events, function_schema, function_name, enabled, definition }]` from `pg_trigger` × `pg_class` × `pg_proc`, excluding internal `tg*_`/constraint triggers. Filter by `pg_class.relname = table_name` when supplied.
- `mcp_list_policies(table_name text default null)` — `LANGUAGE sql`. Returns `[{ schema, table, name, permissive, roles, cmd, qual, with_check }]` from `pg_policies`, filtered by `tablename = table_name` when supplied.
- `mcp_list_grants(table_name text default null)` — `LANGUAGE sql`. Returns `[{ schema, table, grantee, privilege, is_grantable }]` from `information_schema.role_table_grants` where `table_schema = 'public'` and `grantee IN ('anon','authenticated','service_role','postgres')`; filter by `table_name` when supplied.
- `mcp_list_rls_status(table_name text default null)` — `LANGUAGE sql`. Returns `[{ schema, table, rls_enabled, rls_forced }]` from `pg_class` × `pg_namespace` for `relkind='r'` in `public`; filter by `relname` when supplied. Split from grants deliberately so the "grants without RLS" class is directly checkable.
- `mcp_list_indexes(table_name text default null)` — `LANGUAGE sql`. Returns `[{ schema, table, name, is_unique, is_primary, is_partial, predicate, columns, definition }]` from `pg_index` × `pg_class` × `pg_namespace` (+ `pg_get_indexdef`); filter by table when supplied. Directly targets the PostgREST `ON CONFLICT` gap that broke PSC upserts.
- `mcp_list_cron_jobs()` — **`LANGUAGE plpgsql`** with a guarded existence check and dynamic SQL, so a SQL-language planner failure cannot occur when `pg_cron` is absent:
    ```
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
       AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
      EXECUTE 'SELECT coalesce(jsonb_agg(row_to_json(j)), ''[]''::jsonb) FROM …' INTO result;
      RETURN result;
    END IF;
    RETURN '[]'::jsonb;
    ```
    Returns `[{ jobid, schedule, jobname, command, active, database, username }]` or `[]`.

All RPCs return `jsonb` (an array). No `SETOF record` — keeps the MCP wrapper trivial and stable.

### 2. MCP tools — one file each under `src/lib/mcp/tools/`

- `catalog-functions.ts` → tool `catalog_functions`, inputs `{ name_like?: string, include_source?: boolean }` — passed through to the RPC.
- `catalog-triggers.ts` → tool `catalog_triggers`, input `{ table?: string }` — passed as `table_name`.
- `catalog-policies.ts` → tool `catalog_policies`, input `{ table?: string }`.
- `catalog-grants.ts` → tool `catalog_grants`, input `{ table?: string }`.
- `catalog-rls-status.ts` → tool `catalog_rls_status`, input `{ table?: string }`.
- `catalog-indexes.ts` → tool `catalog_indexes`, input `{ table?: string }`.
- `catalog-cron.ts` → tool `catalog_cron`, no input.

Each tool: `readOnlyHint: true, idempotentHint: true, openWorldHint: false`; uses the same user-token Supabase client pattern as `db-schema.ts`; forwards inputs directly to its RPC; returns text + `structuredContent`. No client-side filtering.

### 3. Register tools

Update `src/lib/mcp/index.ts` to import and add the seven new tools to the `tools` array. Extend `instructions` to note: "for verification of functions/triggers/policies/grants/RLS status/indexes/cron, call the `catalog_*` tools — they read the live Postgres catalog under the signed-in user."

### 4. Regenerate manifest and redeploy

- Run `app_mcp_server--extract_mcp_manifest` to refresh `.lovable/mcp/manifest.json`.
- Deploy the `mcp` edge function with `supabase--deploy_edge_functions` (`function_names: ["mcp"]`) so the regenerated function file goes live.

### 5. Verification (post-apply, mandatory)

Split into two phases and record both.

**Phase A — catalog verification** via `supabase--read_query`:

```
SELECT p.proname, p.prosecdef, p.provolatile, p.prolang::regtype,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'mcp_list_%'
 ORDER BY p.proname;
```

Assert: seven rows (`mcp_list_functions`, `mcp_list_triggers`, `mcp_list_policies`, `mcp_list_grants`, `mcp_list_rls_status`, `mcp_list_cron_jobs`, `mcp_list_indexes`); `prosecdef = true`; `provolatile = 's'` for the six SQL RPCs and `'v'` for the plpgsql cron RPC (or `'s'` if declared STABLE — either is acceptable, will be pinned in the migration); `auth_exec = true`; `anon_exec = false`; `svc_exec = true`.

**Phase B — deployed-endpoint verification** via `supabase--curl_edge_functions` against `/functions/v1/mcp` invoking each tool once and asserting:
- `catalog_functions` (no filter) returns a non-empty array including `has_role`, `enforce_vat_filing_gate`, `enforce_ct600_filing_gate`.
- `catalog_policies` returns a non-empty array for at least `user_roles`.
- `catalog_grants` + `catalog_rls_status` return non-empty arrays; every entry in `catalog_rls_status` for a tenant-scoped table has `rls_enabled = true`.
- `catalog_indexes` returns entries for `company_persons` and `company_pscs` including the non-partial unique indexes added for the PSC upsert fix.
- `catalog_cron` returns entries containing `process-email-queue`, `chaser-tick-every-15min`, and `chaser-trigger-scan-every-6h` when `pg_cron` is installed; empty array otherwise (verified via `SELECT extname FROM pg_extension WHERE extname='pg_cron'`).

### 6. Regression test

New file `src/test/regression/mcp-catalog-introspection.test.ts` that asserts the **authenticated RPC/MCP contract**, not just catalog presence:

- Signs in (or uses the existing test-fixture user) so the request runs as `authenticated`.
- Calls each of the seven RPCs via the browser Supabase client.
- Asserts every response is a JSON array; non-empty for the surfaces that must be non-empty in this project (functions, policies, grants, rls_status, indexes); array (possibly empty) for triggers and cron.
- Asserts `catalog_functions({ name_like: 'has_role' })` returns exactly the `has_role` entries (proves server-side filter is wired).
- Asserts an anonymous client (no session) receives `permission denied` on every RPC (proves the grant boundary).

### 7. Release receipt

Because of the recurring "which file actually ran?" class, **do not rely on filename↔`schema_migrations` timestamp proximity** as evidence. Instead, produce and commit a receipt following the existing convention:

- `docs/releases/pending/<date>-mcp-catalog-introspection.json` recording: submitted migration file path, sha256 of file contents, seven expected object names, expected grant matrix, expected tool names, and the deployed function name.
- After Lovable approves and applies, update it in-place with `applied_version` (the `schema_migrations` row), `approver`, `timestamp`, Phase A result rows, and Phase B tool-call responses.
- Move to `docs/releases/` on success.

## Technical notes

- Catalog data is not tenant-scoped, so no `org_id` filter and no per-user redaction. Access is restricted purely by `EXECUTE` grant to `authenticated`.
- SECURITY DEFINER is required because `authenticated` cannot read `pg_proc.prosrc`, `pg_trigger`, or `cron.job` directly. `search_path` is pinned to `public, pg_catalog` on every function to satisfy the linter's function-search-path rule.
- Definitions are potentially large; `mcp_list_functions` omits source by default and requires `include_source = true` to return it. Triggers include definition inline (short strings).
- `mcp_list_cron_jobs` deliberately uses PL/pgSQL + dynamic SQL because a SQL-language function referencing `cron.job` would fail to plan on projects where the extension/schema is absent.
- No changes to existing `db_schema`, `db_select`, `db_insert`, `db_update`, `db_delete`, `db_rpc`, or the three shortcut list tools. No changes to `defineMcp`'s `auth` block or issuer wiring.

## Out of scope

- No write-side catalog tools (creating functions/policies stays on the migration path).
- No `pg_stat_*` runtime metrics — this is definition introspection only.
- No changes to the Companies-House sync pipeline, drift-guard test, or any unrelated feature.
