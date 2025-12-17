import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Use service role to write to cache
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Use anon key for user auth
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    logStep("Authenticating user with token");
    
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get user's organization
    const { data: orgUser, error: orgError } = await supabaseAdmin
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (orgError || !orgUser) {
      logStep("No organization found for user");
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const organizationId = orgUser.organization_id;
    logStep("Found organization", { organizationId });

    // Check if we should use cached value
    const { data: cache } = await supabaseAdmin
      .from('organization_subscription_cache')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    const now = new Date();
    const cacheMaxAge = 15 * 60 * 1000; // 15 minutes
    const expiringThreshold = 24 * 60 * 60 * 1000; // 24 hours

    let shouldRefreshFromStripe = true;

    if (cache) {
      const checkedAt = new Date(cache.checked_at);
      const cacheAge = now.getTime() - checkedAt.getTime();
      const isStale = cacheAge > cacheMaxAge;
      
      const subscriptionEnd = cache.subscription_end ? new Date(cache.subscription_end) : null;
      const isExpiringSoon = subscriptionEnd && (subscriptionEnd.getTime() - now.getTime() < expiringThreshold);

      logStep("Cache found", { 
        age: Math.round(cacheAge / 1000) + 's',
        isStale,
        isExpiringSoon,
        subscribed: cache.subscribed
      });

      // Use cache if fresh and not expiring soon
      if (!isStale && !isExpiringSoon) {
        shouldRefreshFromStripe = false;
        logStep("Using cached value");
        return new Response(JSON.stringify({
          subscribed: cache.subscribed,
          subscription_end: cache.subscription_end,
          subscription_status: cache.subscription_status,
          from_cache: true
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // Refresh from Stripe
    logStep("Refreshing from Stripe");
    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No Stripe customer found, caching unsubscribed state");
      
      // Update cache
      await supabaseAdmin
        .from('organization_subscription_cache')
        .upsert({
          organization_id: organizationId,
          subscribed: false,
          subscription_id: null,
          subscription_status: null,
          subscription_end: null,
          checked_at: now.toISOString(),
        }, { onConflict: 'organization_id' });

      return new Response(JSON.stringify({ subscribed: false, from_cache: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    
    const hasActiveSub = subscriptions.data.length > 0;
    let subscriptionEnd = null;
    let subscriptionId = null;
    let subscriptionStatus = null;
    let planName = null;

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
      subscriptionId = subscription.id;
      subscriptionStatus = subscription.status;
      planName = subscription.items.data[0]?.price?.nickname || null;
      logStep("Active subscription found", { subscriptionId, endDate: subscriptionEnd });
    } else {
      logStep("No active subscription found");
    }

    // Update cache
    await supabaseAdmin
      .from('organization_subscription_cache')
      .upsert({
        organization_id: organizationId,
        subscribed: hasActiveSub,
        subscription_id: subscriptionId,
        subscription_status: subscriptionStatus,
        subscription_end: subscriptionEnd,
        plan_name: planName,
        checked_at: now.toISOString(),
      }, { onConflict: 'organization_id' });

    logStep("Cache updated");

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      subscription_end: subscriptionEnd,
      subscription_status: subscriptionStatus,
      from_cache: false
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
