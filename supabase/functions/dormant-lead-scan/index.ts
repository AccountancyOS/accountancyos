/**
 * dormant-lead-scan
 * Daily cron at 02:00 UTC. Refreshes lead_activity_summary and emits
 * LEAD_DORMANT events for leads crossing the dormancy threshold.
 * verify_jwt = false (cron invocation via service role)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_THRESHOLD_DAYS = 30;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    // 1. Pull all leads that aren't already lost/won
    const { data: leads, error: leadsErr } = await admin
      .from("leads")
      .select("id, organization_id, stage, created_at, updated_at, last_activity_at")
      .not("stage", "in", "(won,lost,dormant)")
      .limit(5000);

    if (leadsErr) {
      console.error("[dormant-lead-scan] leads fetch error:", leadsErr);
      return new Response(JSON.stringify({ error: leadsErr.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let dormantCount = 0;
    const now = Date.now();

    for (const lead of leads ?? []) {
      const lastActivity = new Date(
        (lead.last_activity_at as string) ||
          (lead.updated_at as string) ||
          (lead.created_at as string),
      ).getTime();
      const ageDays = (now - lastActivity) / (1000 * 60 * 60 * 24);
      const isDormant = ageDays >= DEFAULT_THRESHOLD_DAYS;

      // upsert summary projection
      await admin
        .from("lead_activity_summary")
        .upsert(
          {
            lead_id: lead.id,
            organization_id: lead.organization_id,
            last_activity_at: new Date(lastActivity).toISOString(),
            stage: lead.stage,
            dormant_threshold_days: DEFAULT_THRESHOLD_DAYS,
            is_dormant: isDormant,
            refreshed_at: new Date().toISOString(),
          },
          { onConflict: "lead_id" },
        );

      // emit event only on transition (we check if a recent dormant event already exists)
      if (isDormant) {
        const { data: existing } = await admin
          .from("automation_events")
          .select("id")
          .eq("event_type", "LEAD_DORMANT")
          .eq("entity_type", "lead")
          .eq("entity_id", lead.id)
          .gte("created_at", new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString())
          .limit(1)
          .maybeSingle();

        if (!existing) {
          await admin.from("automation_events").insert({
            organization_id: lead.organization_id,
            event_type: "LEAD_DORMANT",
            entity_type: "lead",
            entity_id: lead.id,
            payload: { days_inactive: Math.floor(ageDays) },
            status: "pending",
          });
          dormantCount++;
        }
      }
    }

    return new Response(
      JSON.stringify({ scanned: leads?.length ?? 0, newly_dormant: dormantCount }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[dormant-lead-scan] fatal:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});