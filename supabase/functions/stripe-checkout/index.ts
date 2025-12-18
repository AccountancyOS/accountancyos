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

    const { organizationId, organizationName, intent } = await req.json();

    if (!organizationId || !organizationName) {
      throw new Error('Missing required parameters: organizationId and organizationName are required');
    }

    logStep('Creating checkout session for organization', { organizationId, organizationName, intent });

    // Only apply trial for new signups (intent === 'trial')
    // Returning users (intent === 'reactivate') should not get a trial
    const subscriptionData = intent === 'reactivate' 
      ? {
          metadata: {
            organization_id: organizationId,
          },
        }
      : {
          trial_period_days: 14,
          metadata: {
            organization_id: organizationId,
          },
        };

    logStep('Subscription data configured', { hasTrial: intent !== 'reactivate' });

    // Create a checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: 'AccountancyOS Pro',
              description: 'Full access to AccountancyOS practice management',
            },
            unit_amount: 9900, // £99/month
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      subscription_data: subscriptionData,
      customer_email: null,
      client_reference_id: organizationId,
      success_url: `${req.headers.get('origin')}/onboarding-wizard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/complete-payment?canceled=true`,
      metadata: {
        organization_id: organizationId,
        organization_name: organizationName,
        intent: intent || 'trial',
      },
    });

    logStep('Checkout session created', { sessionId: session.id, hasTrial: intent !== 'reactivate' });

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
