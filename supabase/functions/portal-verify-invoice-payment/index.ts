import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// Called when the portal client returns from Stripe Checkout. Verifies the
// session actually paid (on the practice's Connect account) and marks the
// AccountancyOS invoice paid. Idempotent. Verify-on-return so we don't depend on
// Connect webhook configuration.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { invoice_id, session_id } = await req.json();
    if (!invoice_id || !session_id) {
      return new Response(JSON.stringify({ error: "invoice_id and session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: inv, error: invErr } = await admin
      .from("invoices")
      .select("id, organization_id, total_gross, amount_paid, status")
      .eq("id", invoice_id)
      .maybeSingle();
    if (invErr || !inv) throw new Error("Invoice not found");

    // Already settled — idempotent success.
    if (inv.status === "PAID") {
      return new Response(JSON.stringify({ paid: true, already: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: org } = await admin
      .from("organizations")
      .select("stripe_connect_account_id")
      .eq("id", inv.organization_id)
      .single();
    if (!org?.stripe_connect_account_id) throw new Error("Practice has no Stripe account");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
    const session = await stripe.checkout.sessions.retrieve(
      session_id, { stripeAccount: org.stripe_connect_account_id },
    );

    // Guard: the session must belong to THIS invoice and be paid.
    if (session.metadata?.invoice_id !== invoice_id) throw new Error("Session does not match invoice");
    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ paid: false, payment_status: session.payment_status }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const total = Number(inv.total_gross ?? 0);
    await admin
      .from("invoices")
      .update({
        amount_paid: total,
        status: "PAID",
        paid_at: new Date().toISOString().slice(0, 10),
        stripe_checkout_session_id: session_id,
      })
      .eq("id", invoice_id)
      .neq("status", "PAID");

    return new Response(JSON.stringify({ paid: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[portal-verify-invoice-payment]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
