import { serve } from "@std/http";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HMRC OAuth configuration
// Using sandbox by default - production would use https://api.service.hmrc.gov.uk
const HMRC_AUTH_URL = Deno.env.get('HMRC_AUTH_URL') || 'https://test-api.service.hmrc.gov.uk';
const HMRC_CLIENT_ID = Deno.env.get('HMRC_CLIENT_ID');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// MTD VAT scopes
const SCOPES = [
  'read:vat',
  'write:vat',
].join(' ');

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check if HMRC OAuth is configured
    if (!HMRC_CLIENT_ID) {
      console.log('HMRC_CLIENT_ID not configured');
      return new Response(
        JSON.stringify({ 
          error: 'HMRC OAuth not configured',
          message: 'Please configure HMRC_CLIENT_ID and HMRC_CLIENT_SECRET in your environment variables.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with user's token
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's organization
    const { data: orgUser, error: orgError } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (orgError || !orgUser) {
      console.error('Organization error:', orgError);
      return new Response(
        JSON.stringify({ error: 'User not in organization' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body for redirect URL
    let redirectUrl = '';
    try {
      const body = await req.json();
      if (body.redirect_url) {
        redirectUrl = body.redirect_url;
      }
    } catch {
      // No body or invalid JSON
    }

    // Generate random state token
    const stateBytes = new Uint8Array(32);
    crypto.getRandomValues(stateBytes);
    const state = btoa(String.fromCharCode(...stateBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Store state in database for CSRF protection
    const { error: stateError } = await supabase
      .from('hmrc_auth_states')
      .insert({
        state,
        organization_id: orgUser.organization_id,
        redirect_url: redirectUrl,
      });

    if (stateError) {
      console.error('State storage error:', stateError);
      return new Response(
        JSON.stringify({ error: 'Failed to initiate OAuth' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build HMRC OAuth URL
    const callbackUrl = `${redirectUrl}/settings?hmrc_callback=true`;
    const authUrl = new URL(`${HMRC_AUTH_URL}/oauth/authorize`);
    authUrl.searchParams.set('client_id', HMRC_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('state', state);

    console.log('HMRC OAuth initiated for user:', user.id, 'organization:', orgUser.organization_id);

    return new Response(
      JSON.stringify({ 
        authorization_url: authUrl.toString(),
        state,
        note: 'Using HMRC sandbox environment'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('HMRC auth error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
