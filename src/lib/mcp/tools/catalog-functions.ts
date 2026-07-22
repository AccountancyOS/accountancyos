import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "catalog_functions",
  title: "List database functions",
  description:
    "List public-schema functions from pg_proc with security_definer/volatility/search_path and an md5 hash of the full definition. Set include_source to also return the full CREATE FUNCTION body.",
  inputSchema: {
    name_like: z.string().max(200).optional().describe("Case-insensitive substring filter on function name (applied server-side)."),
    include_source: z.boolean().default(false).describe("Include the full pg_get_functiondef body per row."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ name_like, include_source }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await sb(ctx).rpc("mcp_list_functions", {
      name_like: name_like ?? null,
      include_source: include_source ?? false,
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { functions: data ?? [] },
    };
  },
});