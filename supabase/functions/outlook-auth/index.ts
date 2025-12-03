import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');

// Microsoft Graph OAuth scopes
const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/User.Read',
].join(' ');

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate environment
    if (!MICROSOFT_CLIENT_ID) {
      console.error('MICROSOFT_CLIENT_ID not configured');
      return new Response(
        JSON.stringify({ error: 'Microsoft OAuth not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      SUPABASE_URL!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
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
      .from('outlook_auth_states')
      .insert({
        state,
        user_id: user.id,
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

    // Build Microsoft OAuth URL - redirect through app domain
    const callbackUrl = `${redirectUrl}/auth/outlook/callback`;
    const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    authUrl.searchParams.set('client_id', MICROSOFT_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('prompt', 'consent');

    console.log('Outlook OAuth initiated for user:', user.id);

    return new Response(
      JSON.stringify({ 
        authorization_url: authUrl.toString(),
        state 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Outlook auth error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
