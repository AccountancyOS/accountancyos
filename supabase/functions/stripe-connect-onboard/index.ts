import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface OnboardRequest {
  return_url: string;
  refresh_url: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!STRIPE_SECRET_KEY) {
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: OnboardRequest = await req.json();
    
    if (!body.return_url || !body.refresh_url) {
      return new Response(
        JSON.stringify({ error: 'Missing return_url or refresh_url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userSupabase = createClient(
      SUPABASE_URL!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    
    const serviceSupabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Verify user
    const { data: { user }, error: userError } = await userSupabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's organization (must be owner or admin)
    const { data: orgUser, error: orgError } = await userSupabase
      .from('organization_users')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .single();

    if (orgError || !orgUser) {
      return new Response(
        JSON.stringify({ error: 'Must be organization owner or admin to connect Stripe' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get organization details
    const { data: org, error: fetchOrgError } = await serviceSupabase
      .from('organizations')
      .select('id, name, stripe_connect_account_id')
      .eq('id', orgUser.organization_id)
      .single();

    if (fetchOrgError || !org) {
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    let accountId = org.stripe_connect_account_id;

    // Create account if doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'standard',
        business_profile: {
          name: org.name,
        },
        metadata: {
          organization_id: org.id,
        },
      });

      accountId = account.id;

      // Store in database
      const { error: updateError } = await serviceSupabase
        .from('organizations')
        .update({ stripe_connect_account_id: accountId })
        .eq('id', org.id);

      if (updateError) {
        console.error('Failed to store Stripe account ID:', updateError);
      }
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: body.refresh_url,
      return_url: body.return_url,
      type: 'account_onboarding',
    });

    console.log(`Stripe Connect onboarding URL generated for org ${org.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        onboarding_url: accountLink.url,
        account_id: accountId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Stripe Connect onboard error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
