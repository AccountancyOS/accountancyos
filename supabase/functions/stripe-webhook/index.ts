import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// Map Stripe subscription status to billing_status enum
function mapToBillingStatus(subscriptionStatus: string | null, isDeleted: boolean = false): 'pending_payment' | 'active' | 'past_due' | 'canceled' {
  if (isDeleted) return 'canceled';
  switch (subscriptionStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'pending_payment';
  }
}

// Helper to update subscription cache AND billing_status atomically
async function updateSubscriptionState(
  supabase: any,
  organizationId: string,
  subscribed: boolean,
  subscriptionId: string | null,
  subscriptionStatus: string | null,
  subscriptionEnd: string | null,
  planName: string | null = null,
  stripeCustomerId: string | null = null,
  clearPendingCheckout: boolean = false
) {
  const billingStatus = mapToBillingStatus(subscriptionStatus);
  
  // Update cache
  const { error: cacheError } = await supabase
    .from('organization_subscription_cache')
    .upsert({
      organization_id: organizationId,
      subscribed,
      subscription_id: subscriptionId,
      subscription_status: subscriptionStatus,
      subscription_end: subscriptionEnd,
      plan_name: planName,
      stripe_customer_id: stripeCustomerId,
      checked_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' });

  if (cacheError) {
    logStep('Error updating subscription cache', { error: cacheError.message });
  }

  // Update organization billing_status
  const orgUpdate: Record<string, any> = { billing_status: billingStatus };
  if (clearPendingCheckout) {
    orgUpdate.pending_checkout_session_id = null;
  }
  if (stripeCustomerId) {
    orgUpdate.stripe_customer_id = stripeCustomerId;
  }
  if (subscriptionId) {
    orgUpdate.stripe_subscription_id = subscriptionId;
  }

  const { error: orgError } = await supabase
    .from('organizations')
    .update(orgUpdate)
    .eq('id', organizationId);

  if (orgError) {
    logStep('Error updating organization billing_status', { error: orgError.message });
  } else {
    logStep('Subscription state updated', { organizationId, subscribed, billingStatus, subscriptionStatus });
  }
}

// Check idempotency - returns true if event already processed
async function checkIdempotency(supabase: any, eventId: string, eventType: string, eventCreated: number): Promise<boolean> {
  const { error } = await supabase
    .from('stripe_webhook_events')
    .insert({
      id: eventId,
      type: eventType,
      created_at: new Date(eventCreated * 1000).toISOString(),
    });

  if (error) {
    // Check if it's a unique constraint violation (duplicate)
    if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
      logStep('Event already processed (idempotent skip)', { eventId });
      return true;
    }
    // Other errors - log but continue (fail open for webhook reliability)
    logStep('Idempotency check error (continuing)', { error: error.message });
  }
  return false;
}

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!signature || !webhookSecret) {
    console.error('Missing signature or webhook secret');
    return new Response('Webhook signature or secret missing', { status: 400 });
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    logStep('Received webhook event', { type: event.type, id: event.id });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Idempotency check - skip if already processed
    const isDuplicate = await checkIdempotency(supabase, event.id, event.type, event.created);
    if (isDuplicate) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep('Checkout session completed', { sessionId: session.id });

        // ONLY use metadata for org mapping - no email guessing
        const organizationId = session.metadata?.organization_id;
        if (!organizationId) {
          logStep('No organization_id in session metadata - cannot process', { sessionId: session.id });
          break;
        }

        // Update organization with Stripe customer ID
        await supabase
          .from('organizations')
          .update({
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            pending_checkout_session_id: null, // Clear pending session
          })
          .eq('id', organizationId);

        // If this is a subscription checkout, update the full state
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
          const planName = subscription.items.data[0]?.price?.nickname || 'AccountancyOS Pro';
          const isActive = subscription.status === 'active' || subscription.status === 'trialing';

          await updateSubscriptionState(
            supabase,
            organizationId,
            isActive,
            subscription.id,
            subscription.status,
            subscriptionEnd,
            planName,
            session.customer as string,
            true // clear pending checkout
          );
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        logStep('Subscription event', { subscriptionId: subscription.id, status: subscription.status });

        // Find organization by subscription ID or customer ID only - NO email fallback
        let organizationId: string | null = null;

        // First try by subscription ID
        const { data: orgBySubId } = await supabase
          .from('organizations')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (orgBySubId) {
          organizationId = orgBySubId.id;
        } else {
          // Try by customer ID
          const { data: orgByCustomerId } = await supabase
            .from('organizations')
            .select('id')
            .eq('stripe_customer_id', subscription.customer as string)
            .single();

          if (orgByCustomerId) {
            organizationId = orgByCustomerId.id;
          }
        }

        if (organizationId) {
          const isActive = subscription.status === 'active' || subscription.status === 'trialing';
          const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
          const planName = subscription.items.data[0]?.price?.nickname || 'AccountancyOS Pro';

          await updateSubscriptionState(
            supabase,
            organizationId,
            isActive,
            subscription.id,
            subscription.status,
            subscriptionEnd,
            planName,
            subscription.customer as string,
            isActive // clear pending checkout only if active
          );
        } else {
          logStep('Could not find organization for subscription (no email fallback)', { 
            subscriptionId: subscription.id,
            customerId: subscription.customer 
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        logStep('Subscription deleted', { subscriptionId: subscription.id });

        // Find organization
        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (org) {
          await updateSubscriptionState(
            supabase,
            org.id,
            false,
            null,
            'canceled',
            null,
            null,
            null,
            false
          );

          // Also clear subscription ID from org
          await supabase
            .from('organizations')
            .update({ stripe_subscription_id: null })
            .eq('id', org.id);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        logStep('Invoice payment succeeded', { invoiceId: invoice.id });

        if (invoice.subscription) {
          const { data: org } = await supabase
            .from('organizations')
            .select('id')
            .eq('stripe_subscription_id', invoice.subscription as string)
            .single();

          if (org) {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
            const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
            const planName = subscription.items.data[0]?.price?.nickname || 'AccountancyOS Pro';

            await updateSubscriptionState(
              supabase,
              org.id,
              true,
              subscription.id,
              subscription.status,
              subscriptionEnd,
              planName,
              null,
              true // clear pending checkout
            );
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        logStep('Invoice payment failed', { invoiceId: invoice.id });

        if (invoice.subscription) {
          const { data: org } = await supabase
            .from('organizations')
            .select('id')
            .eq('stripe_subscription_id', invoice.subscription as string)
            .single();

          if (org) {
            await updateSubscriptionState(
              supabase,
              org.id,
              false,
              invoice.subscription as string,
              'past_due',
              null,
              null,
              null,
              false
            );
          }
        }
        break;
      }

      default:
        logStep('Unhandled event type', { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Webhook error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
