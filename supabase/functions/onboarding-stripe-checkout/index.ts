import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function resolveAppBaseUrl(req: Request): string {
  const origin = req.headers.get("origin") || "";
  try {
    const host = new URL(origin).hostname;
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".lovable.app") ||
      host.endsWith(".lovableproject.com") ||
      host === "app.accountancyos.com" ||
      host === "accountancyos.com" ||
      host === "www.accountancyos.com"
    ) {
      return origin.replace(/\/$/, "");
    }
  } catch { /* ignore */ }
  const envUrl = Deno.env.get("APP_PUBLIC_URL");
  if (envUrl) return envUrl.replace(/\/$/, "");
  return "https://app.accountancyos.com";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { application_id } = await req.json();
    if (!application_id) {
      return new Response(JSON.stringify({ error: "application_id required" }), {
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
      .select("id, organization_id, quote_id, email, first_name, last_name, company_name, status, billing_status")
      .eq("id", application_id)
      .maybeSingle();
    if (appErr || !app) throw new Error(appErr?.message ?? "Application not found");
    if (["approved", "rejected", "cancelled"].includes(app.status)) {
      throw new Error("Onboarding is closed");
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, stripe_connect_account_id")
      .eq("id", app.organization_id)
      .single();
    if (!org?.stripe_connect_account_id) {
      throw new Error("Practice has not configured Stripe Connect");
    }

    const { data: quote } = await supabase
      .from("quotes")
      .select("id, currency, accepted_snapshot")
      .eq("id", app.quote_id)
      .single();

    const snapshot = (quote?.accepted_snapshot ?? {}) as any;
    const lines = (snapshot.lines ?? []) as any[];
    const currency = (quote?.currency ?? "GBP").toLowerCase();

    const oneOff = lines.filter((l) => (l.billing_frequency ?? "annual") !== "monthly");
    const monthly = lines.filter((l) => (l.billing_frequency ?? "annual") === "monthly");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customerName = app.company_name ||
      `${app.first_name ?? ""} ${app.last_name ?? ""}`.trim() ||
      app.email || "Client";

    // Subscription mode if monthly lines exist; otherwise one-off payment.
    const isSubscription = monthly.length > 0;

    type LineItem = { price_data: any; quantity: number };
    const lineItems: LineItem[] = isSubscription
      ? monthly.map((l) => ({
          quantity: Number(l.quantity ?? 1),
          price_data: {
            currency,
            unit_amount: Math.round(Number(l.subtotal) / 12 * 100),
            recurring: { interval: "month" },
            product_data: { name: l.service_name },
          },
        }))
      : oneOff.map((l) => ({
          quantity: Number(l.quantity ?? 1),
          price_data: {
            currency,
            unit_amount: Math.round(Number(l.subtotal) * 100),
            product_data: { name: l.service_name },
          },
        }));

    // For subscription mode, include one-off services as add_invoice_items on the first invoice.
    const addInvoiceItems = isSubscription
      ? oneOff.map((l) => ({
          quantity: Number(l.quantity ?? 1),
          price_data: {
            currency,
            unit_amount: Math.round(Number(l.subtotal) * 100),
            product_data: { name: l.service_name },
          },
        }))
      : [];

    const totalAmount = isSubscription
      ? Number(snapshot.total_monthly ?? 0)
      : Number(snapshot.total_now ?? 0);

    const appBase = resolveAppBaseUrl(req);
    // NOTE: the onboarding access token is intentionally NOT included in these
    // Stripe redirect URLs — a third party (Stripe) must never see the secret.
    // The client persists it in sessionStorage before redirecting and restores
    // it on return (see getAccessToken in PublicOnboarding).
    const successUrl = `${appBase}/onboard/${application_id}?billing=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appBase}/onboard/${application_id}?billing=cancelled`;

    const sessionParams: any = {
      mode: isSubscription ? "subscription" : "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      customer_email: app.email ?? undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        onboarding_application_id: application_id,
        organization_id: app.organization_id,
        quote_id: app.quote_id ?? "",
        customer_name: customerName,
      },
    };
    if (isSubscription) {
      sessionParams.subscription_data = {
        metadata: { onboarding_application_id: application_id },
        add_invoice_items: addInvoiceItems,
      };
    } else {
      sessionParams.payment_intent_data = {
        metadata: { onboarding_application_id: application_id },
      };
    }

    const session = await stripe.checkout.sessions.create(
      sessionParams,
      { stripeAccount: org.stripe_connect_account_id }
    );

    await supabase
      .from("onboarding_applications")
      .update({
        stripe_checkout_session_id: session.id,
        billing_amount: totalAmount,
        billing_status: "pending",
      })
      .eq("id", application_id);

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[onboarding-stripe-checkout] ", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});