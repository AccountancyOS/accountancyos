import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Confirms an onboarding Stripe Checkout payment and marks billing complete.
 *
 * Public endpoint (the applicant has no account), so it authenticates the caller with the
 * onboarding access token the applicant holds — never with the token stored in the database.
 * Everything that decides the outcome is then established server-side:
 *   - the session must be the one this application created (stored stripe_checkout_session_id)
 *     AND carry this application's id in its metadata;
 *   - it must actually be paid, according to Stripe;
 *   - the amount recorded is Stripe's amount_total, never a client-supplied or stored figure.
 * public_complete_billing is service-role-only (increment 006), so this function is its only
 * route.
 */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { application_id, session_id, access_token } = await req.json();
    if (!application_id || !session_id) {
      return json({ error: "application_id and session_id required" }, 400);
    }
    if (typeof access_token !== "string" || access_token.length === 0) {
      return json({ error: "unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: tokenOk, error: tokenErr } = await supabase.rpc("validate_onboarding_access_token", {
      p_application_id: application_id,
      p_token: access_token,
    });
    if (tokenErr || tokenOk !== true) return json({ error: "unauthorized" }, 401);

    const { data: app, error: appErr } = await supabase
      .from("onboarding_applications")
      .select("id, organization_id, status, billing_status, stripe_checkout_session_id")
      .eq("id", application_id)
      .maybeSingle();
    if (appErr || !app) return json({ error: "Application not found" }, 404);

    if (app.billing_status === "completed") return json({ paid: true, already: true }, 200);

    // The session must be the one this application's checkout created.
    if (!app.stripe_checkout_session_id || app.stripe_checkout_session_id !== session_id) {
      return json({ error: "session_mismatch" }, 409);
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_connect_account_id")
      .eq("id", app.organization_id)
      .single();
    if (!org?.stripe_connect_account_id) return json({ error: "Stripe Connect not configured" }, 409);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "not_configured" }, 503);
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const session = await stripe.checkout.sessions.retrieve(
      session_id,
      { stripeAccount: org.stripe_connect_account_id }
    );

    if (session.metadata?.onboarding_application_id !== application_id) {
      return json({ error: "session_mismatch" }, 409);
    }

    const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
    if (!paid) return json({ paid: false, status: session.status }, 200);

    if (typeof session.amount_total !== "number") {
      return json({ error: "amount_unavailable" }, 409);
    }
    const amount = session.amount_total / 100;

    const { error: rpcErr } = await supabase.rpc("public_complete_billing", {
      p_application_id: application_id,
      p_access_token: access_token,
      p_stripe_session_id: session.id,
      p_amount: amount,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    return json({ paid: true }, 200);
  } catch (e) {
    console.error("[onboarding-stripe-verify] ", e instanceof Error ? e.message : String(e));
    return json({ error: "verification_failed" }, 400);
  }
});
