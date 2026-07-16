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
  name: "db_rpc",
  title: "Call a database function",
  description: "Invoke a Postgres function exposed via PostgREST (RPC). RLS and function grants apply.",
  inputSchema: {
    function_name: z.string().min(1),
    args: z.record(z.any()).optional(),
  },
  annotations: { readOnlyHint: false, openWorldHint: false },
  handler: async ({ function_name, args }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await sb(ctx).rpc(function_name, args ?? {});
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? null, null, 2) }], structuredContent: { result: data ?? null } };
  },
});