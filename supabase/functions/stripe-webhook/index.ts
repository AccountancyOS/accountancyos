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

// Helper to update subscription cache
async function updateSubscriptionCache(
  supabase: any,
  organizationId: string,
  subscribed: boolean,
  subscriptionId: string | null,
  subscriptionStatus: string | null,
  subscriptionEnd: string | null,
  planName: string | null = null
) {
  const { error } = await supabase
    .from('organization_subscription_cache')
    .upsert({
      organization_id: organizationId,
      subscribed,
      subscription_id: subscriptionId,
      subscription_status: subscriptionStatus,
      subscription_end: subscriptionEnd,
      plan_name: planName,
      checked_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' });

  if (error) {
    logStep('Error updating subscription cache', { error: error.message });
  } else {
    logStep('Subscription cache updated', { organizationId, subscribed, subscriptionStatus });
  }
}

// Helper to find organization by customer email
async function findOrganizationByCustomerEmail(supabase: any, customerEmail: string): Promise<string | null> {
  // Find user by email
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) {
    logStep('Error listing users', { error: userError.message });
    return null;
  }

  const user = users.users?.find((u: any) => u.email === customerEmail);
  if (!user) {
    logStep('No user found for email', { email: customerEmail });
    return null;
  }

  // Find organization for user
  const { data: orgUser, error: orgError } = await supabase
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();

  if (orgError || !orgUser) {
    logStep('No organization found for user', { userId: user.id });
    return null;
  }

  return orgUser.organization_id;
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

    logStep('Received webhook event', { type: event.type });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep('Checkout session completed', { sessionId: session.id });

        const organizationId = session.metadata?.organization_id;
        if (!organizationId) {
          logStep('No organization_id in session metadata');
          break;
        }

        // Update organization with Stripe customer and subscription IDs
        const { error } = await supabase
          .from('organizations')
          .update({
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', organizationId);

        if (error) {
          logStep('Error updating organization', { error: error.message });
        } else {
          logStep('Updated organization with Stripe IDs', { organizationId });
        }

        // If this is a subscription checkout, update the cache
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
          const planName = subscription.items.data[0]?.price?.nickname || null;
          
          await updateSubscriptionCache(
            supabase,
            organizationId,
            subscription.status === 'active' || subscription.status === 'trialing',
            subscription.id,
            subscription.status,
            subscriptionEnd,
            planName
          );
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        logStep('Subscription event', { subscriptionId: subscription.id, status: subscription.status });

        // Find organization by matching stripe_subscription_id or customer email
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
          } else {
            // Fallback: find by customer email
            const customer = await stripe.customers.retrieve(subscription.customer as string);
            if (customer && !customer.deleted && customer.email) {
              organizationId = await findOrganizationByCustomerEmail(supabase, customer.email);
            }
          }
        }

        if (organizationId) {
          const isActive = subscription.status === 'active' || subscription.status === 'trialing';
          const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
          const planName = subscription.items.data[0]?.price?.nickname || null;

          await updateSubscriptionCache(
            supabase,
            organizationId,
            isActive,
            subscription.id,
            subscription.status,
            subscriptionEnd,
            planName
          );

          // Also update organization's stripe_subscription_id if needed
          await supabase
            .from('organizations')
            .update({ stripe_subscription_id: subscription.id })
            .eq('id', organizationId);
        } else {
          logStep('Could not find organization for subscription', { subscriptionId: subscription.id });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        logStep('Subscription deleted', { subscriptionId: subscription.id });

        // Find and update organization
        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (org) {
          // Update organization to remove subscription
          await supabase
            .from('organizations')
            .update({ stripe_subscription_id: null })
            .eq('id', org.id);

          // Update cache to show unsubscribed
          await updateSubscriptionCache(
            supabase,
            org.id,
            false,
            null,
            'canceled',
            null,
            null
          );
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        logStep('Invoice payment succeeded', { invoiceId: invoice.id });

        // Update cache if this is a subscription invoice
        if (invoice.subscription) {
          const { data: org } = await supabase
            .from('organizations')
            .select('id')
            .eq('stripe_subscription_id', invoice.subscription as string)
            .single();

          if (org) {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
            const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
            
            await updateSubscriptionCache(
              supabase,
              org.id,
              true,
              subscription.id,
              subscription.status,
              subscriptionEnd,
              subscription.items.data[0]?.price?.nickname || null
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
            // Update cache to show past_due status
            await updateSubscriptionCache(
              supabase,
              org.id,
              false,
              invoice.subscription as string,
              'past_due',
              null,
              null
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
