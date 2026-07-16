import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_upcoming_deadlines",
  title: "List upcoming deadlines",
  description:
    "List upcoming (not-yet-filed) statutory and internal deadlines in the signed-in user's organisation, soonest first.",
  inputSchema: {
    within_days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .default(60)
      .describe("Only include deadlines due within this many days from today."),
    limit: z.number().int().min(1).max(200).default(50).describe("Max rows to return (1-200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ within_days, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const now = new Date();
    const until = new Date(now.getTime() + within_days * 86_400_000);
    const { data, error } = await sb
      .from("deadlines")
      .select(
        "id, name, deadline_type, filing_body, due_date, status, client_id, company_id, service_code",
      )
      .is("filed_at", null)
      .gte("due_date", now.toISOString().slice(0, 10))
      .lte("due_date", until.toISOString().slice(0, 10))
      .order("due_date", { ascending: true })
      .limit(limit);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { deadlines: data ?? [] },
    };
  },
});