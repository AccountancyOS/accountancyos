import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "db_insert",
  title: "Insert rows",
  description: "Insert one or more rows into a public table. RLS applies. Returns the inserted rows.",
  inputSchema: {
    table: z.string().min(1),
    rows: z.union([z.record(z.any()), z.array(z.record(z.any()))]),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ table, rows }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await sb(ctx).from(table).insert(rows as any).select();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }], structuredContent: { rows: data ?? [] } };
  },
});