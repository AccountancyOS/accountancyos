import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-CHECKOUT] ${step}${detailsStr}`);
};

/**
 * Resolve the canonical app base URL for success/cancel URLs.
 * Prefers the request `origin` header when it matches a known-safe host
 * (preview OR production), so the user is always returned to the same
 * origin they started checkout from — otherwise their Supabase session
 * (stored per-origin) is lost and ProtectedRoute bounces them to /auth.
 * Falls back to APP_PUBLIC_URL, then the hard-coded production URL, when
 * no usable origin header is present (e.g. server-to-server callers).
 */
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
  } catch {
    // ignore
  }

  const envUrl = Deno.env.get("APP_PUBLIC_URL");
  if (envUrl) return envUrl.replace(/\/$/, "");
  return "https://app.accountancyos.com";
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { organizationId, organizationName, intent, plan } = await req.json();

    if (!organizationId || !organizationName) {
      throw new Error('Missing required parameters: organizationId and organizationName are required');
    }

    // Determine which price ID to use based on plan selection
    const selectedPlan = plan || 'team'; // Default to team if not specified
    let priceId: string | null = null;

    switch (selectedPlan) {
      case 'solo':
        priceId = Deno.env.get('STRIPE_PRICE_SOLO') || null;
        break;
      case 'team':
        priceId = Deno.env.get('STRIPE_PRICE_TEAM') || null;
        break;
      case 'scale':
        priceId = Deno.env.get('STRIPE_PRICE_SCALE') || null;
        break;
      default:
        priceId = Deno.env.get('STRIPE_PRICE_TEAM') || null;
    }

    logStep('Creating checkout session for organization', { 
      organizationId, 
      organizationName, 
      intent, 
      plan: selectedPlan,
      hasPriceId: !!priceId 
    });

    // Only apply trial for new signups (intent === 'trial')
    // Returning users (intent === 'reactivate') should not get a trial
    const subscriptionData = intent === 'reactivate' 
      ? {
          metadata: {
            organization_id: organizationId,
            plan: selectedPlan,
          },
        }
      : {
          trial_period_days: 14,
          metadata: {
            organization_id: organizationId,
            plan: selectedPlan,
          },
        };

    logStep('Subscription data configured', { hasTrial: intent !== 'reactivate', plan: selectedPlan });

    // Build line items - use price ID if available, otherwise fall back to price_data
    let lineItems;
    if (priceId) {
      lineItems = [
        {
          price: priceId,
          quantity: 1,
        },
      ];
      logStep('Using Stripe Price ID', { priceId });
    } else {
      // Fallback to price_data if no price ID configured (for backwards compatibility)
      const planPricing: Record<string, { name: string; amount: number; description: string }> = {
        solo: {
          name: 'AccountancyOS Solo',
          amount: 19900, // £199/month + VAT
          description: '1 user - Full access to all features',
        },
        team: {
          name: 'AccountancyOS Team',
          amount: 29900, // £299/month + VAT
          description: '2-4 users - Full access to all features',
        },
        scale: {
          name: 'AccountancyOS Scale',
          amount: 59900, // £599/month + VAT
          description: '5-10 users - Full access to all features',
        },
      };

      const pricing = planPricing[selectedPlan] || planPricing.team;
      
      lineItems = [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: pricing.name,
              description: pricing.description,
            },
            unit_amount: pricing.amount,
            recurring: {
              interval: 'month' as const,
            },
          },
          quantity: 1,
        },
      ];
      logStep('Using price_data fallback', { plan: selectedPlan, amount: pricing.amount });
    }

    // Create a checkout session
    const appBaseUrl = resolveAppBaseUrl(req);
    const successUrl = `${appBaseUrl}/onboarding-wizard?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appBaseUrl}/complete-payment?canceled=true`;
    logStep('Resolved app URLs', { appBaseUrl, successUrl, cancelUrl });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: lineItems,
      subscription_data: subscriptionData,
      client_reference_id: organizationId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        organization_id: organizationId,
        organization_name: organizationName,
        intent: intent || 'trial',
        plan: selectedPlan,
      },
    });

    logStep('Checkout session created', { sessionId: session.id, hasTrial: intent !== 'reactivate', plan: selectedPlan });

    // Store pending_checkout_session_id server-side (not from frontend)
    const { error: updateError } = await supabase
      .from('organizations')
      .update({ pending_checkout_session_id: session.id })
      .eq('id', organizationId);

    if (updateError) {
      logStep('Warning: Failed to store pending_checkout_session_id', { error: updateError.message });
      // Don't fail the checkout - this is non-critical
    } else {
      logStep('Stored pending_checkout_session_id on organization');
    }

    return new Response(
      JSON.stringify({ sessionId: session.id, url: session.url }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error creating checkout session:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
