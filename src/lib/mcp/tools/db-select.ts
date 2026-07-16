import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const OpEnum = z.enum([
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains",
]);

export default defineTool({
  name: "db_select",
  title: "Query any table",
  description:
    "Read rows from any public table. RLS applies (acts as the signed-in user). Use db_schema first to discover columns.",
  inputSchema: {
    table: z.string().min(1).describe("Public table name."),
    columns: z.string().default("*").describe("PostgREST select string, e.g. 'id, name' or '*'."),
    filters: z
      .array(z.object({ column: z.string(), op: OpEnum, value: z.any() }))
      .optional()
      .describe("Optional filters combined with AND. Value type depends on op; 'in' takes an array."),
    order: z
      .object({ column: z.string(), ascending: z.boolean().default(true) })
      .optional(),
    limit: z.number().int().min(1).max(500).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ table, columns, filters, order, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q: any = sb(ctx).from(table).select(columns).limit(limit);
    for (const f of filters ?? []) {
      q = (q as any)[f.op](f.column, f.value);
    }
    if (order) q = q.order(order.column, { ascending: order.ascending });
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});