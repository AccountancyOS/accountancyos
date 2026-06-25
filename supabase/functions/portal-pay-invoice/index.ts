import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// Portal client pays one of their AccountancyOS invoices via the practice's
// Stripe Connect account. Returns a Checkout URL; the actual "mark paid" happens
// on return via portal-verify-invoice-payment (verify-on-return, so we don't
// depend on Connect webhook configuration).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function resolveAppBaseUrl(req: Request): string {
  const origin = req.headers.get("origin") || "";
  try {
    const host = new URL(origin).hostname;
    if (
      host === "localhost" || host === "127.0.0.1" ||
      host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com") ||
      host === "client.accountancyos.com" || host === "app.accountancyos.com" ||
      host === "accountancyos.com" || host === "www.accountancyos.com"
    ) return origin.replace(/\/$/, "");
  } catch { /* ignore */ }
  return "https://client.accountancyos.com";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "invoice_id required" }), {
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

    // 2. Load the invoice (service role).
    const { data: inv, error: invErr } = await admin
      .from("invoices")
      .select("id, organization_id, client_id, company_id, invoice_number, total_gross, amount_paid, currency, status")
      .eq("id", invoice_id)
      .maybeSingle();
    if (invErr || !inv) throw new Error("Invoice not found");
    if (["PAID", "VOID"].includes(String(inv.status))) throw new Error("Invoice is not payable");

    // 3. Authorise: the portal user must have active portal_access to this invoice's entity.
    //    Query under the user's JWT so RLS (user_id = auth.uid()) enforces ownership.
    const entityCol = inv.client_id ? "client_id" : "company_id";
    const entityId = inv.client_id ?? inv.company_id;
    const { data: access } = await userClient
      .from("portal_access")
      .select("id")
      .eq(entityCol, entityId)
      .eq("is_active", true)
      .limit(1);
    if (!access || access.length === 0) throw new Error("Not authorised for this invoice");

    // 4. Practice's Stripe Connect account.
    const { data: org } = await admin
      .from("organizations")
      .select("id, name, stripe_connect_account_id")
      .eq("id", inv.organization_id)
      .single();
    if (!org?.stripe_connect_account_id) {
      throw new Error("Your accountant has not enabled online payments yet.");
    }

    const due = Math.max(0, Number(inv.total_gross ?? 0) - Number(inv.amount_paid ?? 0));
    if (due <= 0) throw new Error("Nothing left to pay on this invoice");
    const currency = String(inv.currency ?? "GBP").toLowerCase();

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
    const appBase = resolveAppBaseUrl(req);

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.round(due * 100),
            product_data: { name: `Invoice ${inv.invoice_number ?? inv.id.slice(0, 8)}` },
          },
        }],
        success_url: `${appBase}/portal/payments?paid_invoice=${inv.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appBase}/portal/payments?pay_cancelled=1`,
        metadata: { invoice_id: inv.id, organization_id: inv.organization_id, kind: "aos_invoice" },
        payment_intent_data: { metadata: { invoice_id: inv.id, kind: "aos_invoice" } },
      },
      { stripeAccount: org.stripe_connect_account_id },
    );

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[portal-pay-invoice]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
