import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listClients from "./tools/list-clients";
import listJobs from "./tools/list-jobs";
import listDeadlines from "./tools/list-deadlines";
import dbSchema from "./tools/db-schema";
import dbSelect from "./tools/db-select";
import dbInsert from "./tools/db-insert";
import dbUpdate from "./tools/db-update";
import dbDelete from "./tools/db-delete";
import dbRpc from "./tools/db-rpc";
import catalogFunctions from "./tools/catalog-functions";
import catalogTriggers from "./tools/catalog-triggers";
import catalogPolicies from "./tools/catalog-policies";
import catalogGrants from "./tools/catalog-grants";
import catalogRlsStatus from "./tools/catalog-rls-status";
import catalogIndexes from "./tools/catalog-indexes";
import catalogCron from "./tools/catalog-cron";

// Build the OAuth issuer from the Supabase project ref (inlined by Vite at
// build time via `define`), never from SUPABASE_URL, which may be a proxy host.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "accountancyos-mcp",
  title: "AccountancyOS",
  version: "0.1.0",
  instructions:
    "Full-access tools for an AccountancyOS practice. list_clients / list_jobs / list_upcoming_deadlines are shortcuts for common reads. For anything else, call db_schema to discover tables, then db_select / db_insert / db_update / db_delete / db_rpc. For verification of functions, triggers, policies, grants, RLS status, indexes, and cron jobs, call the catalog_* tools — they read the live Postgres catalog under the signed-in user. All calls act as the signed-in user and are subject to that user's RLS permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listClients,
    listJobs,
    listDeadlines,
    dbSchema,
    dbSelect,
    dbInsert,
    dbUpdate,
    dbDelete,
    dbRpc,
    catalogFunctions,
    catalogTriggers,
    catalogPolicies,
    catalogGrants,
    catalogRlsStatus,
    catalogIndexes,
    catalogCron,
  ],
});