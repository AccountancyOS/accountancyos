/**
 * invoice-overdue-scan
 * Daily cron at 06:00 UTC. Emits INVOICE_OVERDUE automation events for
 * unpaid invoices whose due_date is in the past, once per day per invoice.
 * verify_jwt = false (cron invocation via service role).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const todayIso = new Date().toISOString();
    const todayDate = todayIso.split("T")[0];
    const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Pull overdue, unpaid invoices.
    const { data: invoices, error } = await admin
      .from("invoices")
      .select("id, organization_id, client_id, company_id, due_date, status, amount_due, total")
      .lt("due_date", todayDate)
      .not("status", "in", "(paid,void,cancelled,written_off)")
      .limit(5000);

    if (error) {
      console.error("[invoice-overdue-scan] fetch error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let emitted = 0;

    for (const inv of invoices ?? []) {
      const dueDate = inv.due_date as string;
      const daysOverdue = Math.max(
        0,
        Math.floor((Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24)),
      );

      // De-dupe: skip if we've emitted INVOICE_OVERDUE for this invoice in the last 24h.
      const { data: existing } = await admin
        .from("automation_events")
        .select("id")
        .eq("event_type", "INVOICE_OVERDUE")
        .eq("entity_type", "invoice")
        .eq("entity_id", inv.id)
        .gte("created_at", dayAgoIso)
        .limit(1)
        .maybeSingle();

      if (existing) continue;

      const { error: insErr } = await admin.from("automation_events").insert({
        organization_id: inv.organization_id,
        event_type: "INVOICE_OVERDUE",
        entity_type: "invoice",
        entity_id: inv.id,
        new_value: { status: "overdue", days_overdue: daysOverdue, due_date: dueDate },
        metadata: {
          clientId: inv.client_id,
          companyId: inv.company_id,
          daysOverdue,
          amountDue: inv.amount_due ?? inv.total,
        },
      });

      if (insErr) {
        console.warn(`[invoice-overdue-scan] emit failed for invoice ${inv.id}: ${insErr.message}`);
        continue;
      }
      emitted++;
    }

    return new Response(
      JSON.stringify({ scanned: invoices?.length ?? 0, emitted }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[invoice-overdue-scan] fatal:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});