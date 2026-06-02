/**
 * Automation Dry-Run
 *
 * Resolves the context for a given subject + policy/template combination,
 * evaluates conditions, and returns the plan of steps that WOULD execute.
 * Nothing is persisted, no emails are sent.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DryRunRequest {
  mode: "chaser_policy" | "workflow_template";
  policy_id?: string;
  template_id?: string;
  subject_type?: string;
  subject_id?: string;
  client_id?: string;
  company_id?: string;
}

function resolvePlaceholders(s: string, ctx: Record<string, string>): string {
  if (!s) return s;
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? `{{${k}}}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: authErr } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(supabaseUrl, service);

    const body = (await req.json()) as DryRunRequest;
    if (!body.mode) {
      return new Response(JSON.stringify({ error: "mode required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build resolution context
    const ctx: Record<string, string> = {};
    if (body.client_id) {
      const { data: c } = await supabase.from("clients").select("id, first_name, last_name, email, business_name").eq("id", body.client_id).maybeSingle();
      if (c) {
        ctx.client_id = c.id;
        ctx.client_name = c.business_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
        ctx.client_email = c.email ?? "";
      }
    }
    if (body.company_id) {
      const { data: co } = await supabase.from("companies").select("id, name").eq("id", body.company_id).maybeSingle();
      if (co) { ctx.company_id = co.id; ctx.company_name = co.name; }
    }
    ctx.period_key = new Date().toISOString().slice(0, 10);

    if (body.mode === "chaser_policy") {
      if (!body.policy_id) {
        return new Response(JSON.stringify({ error: "policy_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: policy, error: pErr } = await supabase
        .from("automation_chaser_policies")
        .select("id, name, category, trigger_type, frequency_interval, frequency_unit, max_sends, is_enabled, organization_id, email_template_id")
        .eq("id", body.policy_id)
        .maybeSingle();
      if (pErr || !policy) {
        return new Response(JSON.stringify({ error: "Policy not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      let renderedSubject = "";
      let renderedBody = "";
      if (policy.email_template_id) {
        const { data: tpl } = await supabase.from("templates").select("subject, body").eq("id", policy.email_template_id).maybeSingle();
        renderedSubject = resolvePlaceholders(tpl?.subject || "", ctx);
        renderedBody = resolvePlaceholders(tpl?.body || "", ctx);
      }
      return new Response(
        JSON.stringify({
          mode: "chaser_policy",
          dry_run: true,
          policy: { id: policy.id, name: policy.name, category: policy.category, trigger: policy.trigger_type, cadence: `every ${policy.frequency_interval} ${policy.frequency_unit}`, max_sends: policy.max_sends, enabled: policy.is_enabled },
          resolved_context: ctx,
          would_send: { subject: renderedSubject, body_preview: renderedBody.slice(0, 500) },
          notes: ["Nothing was persisted or sent.", "Real run uses the configured stop conditions to halt this chaser."],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.mode === "workflow_template") {
      if (!body.template_id) {
        return new Response(JSON.stringify({ error: "template_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: tpl, error: tErr } = await supabase
        .from("automation_workflow_templates")
        .select("id, name, service_type")
        .eq("id", body.template_id)
        .maybeSingle();
      if (tErr || !tpl) {
        return new Response(JSON.stringify({ error: "Template not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: steps } = await supabase
        .from("automation_workflow_steps")
        .select("id, step_order, step_type, config, is_optional")
        .eq("template_id", body.template_id)
        .order("step_order", { ascending: true });
      const plan = (steps || []).map((s: { id: string; step_order: number; step_type: string; config: Record<string, unknown>; is_optional: boolean }) => {
        const cfg = s.config as Record<string, unknown>;
        let preview = "";
        if (s.step_type === "SEND_EMAIL") preview = resolvePlaceholders((cfg.subject_override as string) || "", ctx);
        if (s.step_type === "CREATE_TASK") preview = resolvePlaceholders((cfg.title as string) || "", ctx);
        if (s.step_type === "SEND_PORTAL_MESSAGE") preview = resolvePlaceholders((cfg.subject as string) || "", ctx);
        if (s.step_type === "WAIT_UNTIL") preview = `wait ${cfg.offset_days ?? 0} days from ${cfg.base_date_field ?? "period_end"}`;
        if (s.step_type === "WAIT_FOR_EVENT") preview = `wait for ${cfg.event_key}`;
        return { step_order: s.step_order, type: s.step_type, optional: s.is_optional, preview };
      });
      return new Response(
        JSON.stringify({
          mode: "workflow_template",
          dry_run: true,
          template: { id: tpl.id, name: tpl.name, service_type: tpl.service_type },
          resolved_context: ctx,
          plan,
          notes: ["Nothing was persisted or sent.", "Real run honours per-org timing/template/assignee overrides and stop conditions."],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown mode" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});