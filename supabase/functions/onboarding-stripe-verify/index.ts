import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { application_id, session_id } = await req.json();
    if (!application_id || !session_id) {
      return new Response(JSON.stringify({ error: "application_id and session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: app, error: appErr } = await supabase
      .from("onboarding_applications")
      .select("id, organization_id, status, billing_amount")
      .eq("id", application_id)
      .maybeSingle();
    if (appErr || !app) throw new Error(appErr?.message ?? "Application not found");

    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_connect_account_id")
      .eq("id", app.organization_id)
      .single();
    if (!org?.stripe_connect_account_id) throw new Error("Stripe Connect not configured");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });
    const session = await stripe.checkout.sessions.retrieve(
      session_id,
      { stripeAccount: org.stripe_connect_account_id }
    );

    const paid =
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required" ||
      session.status === "complete";

    if (!paid) {
      return new Response(JSON.stringify({ paid: false, status: session.status }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amount =
      typeof session.amount_total === "number"
        ? session.amount_total / 100
        : app.billing_amount ?? null;

    const { error: rpcErr } = await supabase.rpc("public_complete_billing", {
      p_application_id: application_id,
      p_stripe_session_id: session_id,
      p_amount: amount,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    return new Response(JSON.stringify({ paid: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[onboarding-stripe-verify] ", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});