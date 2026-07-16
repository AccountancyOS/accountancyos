import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listClients from "./tools/list-clients";
import listJobs from "./tools/list-jobs";
import listDeadlines from "./tools/list-deadlines";

// Build the OAuth issuer from the Supabase project ref (inlined by Vite at
// build time via `define`), never from SUPABASE_URL, which may be a proxy host.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "accountancyos-mcp",
  title: "AccountancyOS",
  version: "0.1.0",
  instructions:
    "Read-only tools for an AccountancyOS practice. Use list_clients to look up clients, list_jobs to inspect work in progress, and list_upcoming_deadlines to see what is due. All calls act as the signed-in user and respect their organisation permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listClients, listJobs, listDeadlines],
});