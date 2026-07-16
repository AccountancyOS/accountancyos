import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const OpEnum = z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"]);

export default defineTool({
  name: "db_delete",
  title: "Delete rows",
  description: "Delete rows from a public table matching the filters. RLS applies. At least one filter is required.",
  inputSchema: {
    table: z.string().min(1),
    filters: z.array(z.object({ column: z.string(), op: OpEnum, value: z.any() })).min(1),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ table, filters }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q: any = sb(ctx).from(table).delete();
    for (const f of filters) q = (q as any)[f.op](f.column, f.value);
    const { data, error } = await q.select();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }], structuredContent: { rows: data ?? [] } };
  },
});