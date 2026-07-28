import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// Called when the portal client returns from Stripe Checkout. Verifies the
// session actually paid (on the practice's Connect account) and marks the
// AccountancyOS invoice paid. Idempotent. Verify-on-return so we don't depend on
// Connect webhook configuration.
//
// DEF-024: this used to read no Authorization header, resolve no user and check no
// portal_access — it took a caller-supplied invoice_id on trust and answered with a
// service-role client. It could not falsely settle an invoice (the Stripe session still
// had to be paid and to carry a matching invoice_id), but it was an oracle: it told any
// anonymous caller whether an invoice id existed, whether the practice had Stripe
// configured, and it let them drive Stripe API calls on the practice's integration.
//
// It now authorises exactly as portal-pay-invoice does — the local reference pattern:
// identify the portal user from their JWT, then confirm active portal_access to the
// invoice's entity, queried under the USER's token so RLS enforces ownership rather
// than trusting a lookup made with the service role.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * One message for "no such invoice" and for "not yours".
 *
 * Distinguishing them re-creates the enumeration oracle this fix removes: a caller who
 * can tell those two apart can walk the id space and map which invoices exist.
 */
const NOT_YOURS = "Invoice not found or not accessible";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { invoice_id, session_id } = await req.json();
    if (!invoice_id || !session_id) {
      return new Response(JSON.stringify({ error: "invoice_id and session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // 1. Identify the portal user from their JWT.
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) throw new Error("Not authenticated");
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) throw new Error("Not authenticated");

    const { data: inv, error: invErr } = await admin
      .from("invoices")
      .select("id, organization_id, client_id, company_id, total_gross, amount_paid, status")
      .eq("id", invoice_id)
      .maybeSingle();
    if (invErr || !inv) throw new Error(NOT_YOURS);

    // 2. Authorise BEFORE anything else is disclosed or any Stripe call is made: the
    //    portal user must hold active portal_access to this invoice's entity. Queried
    //    under the user's JWT so RLS (user_id = auth.uid()) does the enforcing.
    const entityCol = inv.client_id ? "client_id" : "company_id";
    const entityId = inv.client_id ?? inv.company_id;
    const { data: access } = await userClient
      .from("portal_access")
      .select("id")
      .eq(entityCol, entityId)
      .eq("is_active", true)
      .limit(1);
    if (!access || access.length === 0) throw new Error(NOT_YOURS);

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
    const today = new Date().toISOString().slice(0, 10);

    // Post the receipt through the ledger engine (Dr Bank / Cr Trade Debtors, updates
    // amount_paid + status) instead of a raw status flip. Resolve the entity's bank account
    // so it posts; if that fails, fall back to a direct mark-paid so a real payment is never
    // lost (and log it for reconciliation).
    let bankQuery = admin.from("bookkeeping_accounts").select("id")
      .eq("organization_id", inv.organization_id).eq("is_bank_account", true);
    bankQuery = inv.client_id ? bankQuery.eq("client_id", inv.client_id) : bankQuery.eq("company_id", inv.company_id);
    const { data: bankAcct } = await bankQuery.order("code").limit(1).maybeSingle();

    const { data: payRes, error: payErr } = await admin.rpc("record_invoice_payment", {
      p_invoice_id: invoice_id,
      p_amount: total,
      p_payment_date: today,
      p_bank_account_id: bankAcct?.id ?? null,
      p_bank_transaction_id: null,
      p_reference: `Stripe ${session_id}`,
      p_payment_method: "stripe",
      p_user_id: null,
      p_payment_fx_rate: 1.0, // pin to the 9-arg overload (avoids the ambiguous-overload error)
    });

    if (payErr || (payRes && (payRes as any).success === false)) {
      console.warn("[portal-verify-invoice-payment] record_invoice_payment failed; falling back to direct paid update", payErr ?? payRes);
      await admin.from("invoices").update({ amount_paid: total, status: "PAID", paid_at: today }).eq("id", invoice_id).neq("status", "PAID");
    }
    // Idempotency marker (record_invoice_payment doesn't set this).
    await admin.from("invoices").update({ stripe_checkout_session_id: session_id }).eq("id", invoice_id);

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
