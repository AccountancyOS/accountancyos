import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptToken, assertTokenCryptoConfigured, notConfiguredResponse } from "../_shared/token-crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HMRC OAuth configuration
const HMRC_AUTH_URL = Deno.env.get('HMRC_AUTH_URL') || 'https://test-api.service.hmrc.gov.uk';
const HMRC_CLIENT_ID = Deno.env.get('HMRC_CLIENT_ID');
const HMRC_CLIENT_SECRET = Deno.env.get('HMRC_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Fail closed before consuming the one-time OAuth state: with no valid ENCRYPTION_KEY the
  // tokens could not be stored safely, and there is deliberately no fallback key.
  try {
    assertTokenCryptoConfigured();
  } catch {
    console.error('HMRC callback refused: ENCRYPTION_KEY not configured');
    return notConfiguredResponse(corsHeaders);
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      console.error('HMRC OAuth error:', error);
      const errorDesc = url.searchParams.get('error_description') || error;
      return Response.redirect(`${SUPABASE_URL}/settings?hmrc_error=${encodeURIComponent(errorDesc)}`);
    }

    if (!code || !state) {
      return new Response(
        JSON.stringify({ error: 'Missing code or state parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate state and get organization
    const { data: authState, error: stateError } = await supabase
      .from('hmrc_auth_states')
      .select('*')
      .eq('state', state)
      .single();

    if (stateError || !authState) {
      console.error('Invalid state:', stateError);
      return Response.redirect(`${authState?.redirect_url || ''}/settings?error=invalid_state`);
    }

    // Check if state is expired
    if (new Date(authState.expires_at) < new Date()) {
      console.error('State expired');
      await supabase.from('hmrc_auth_states').delete().eq('id', authState.id);
      return Response.redirect(`${authState.redirect_url}/settings?error=state_expired`);
    }

    // Delete used state
    await supabase.from('hmrc_auth_states').delete().eq('id', authState.id);

    // Check HMRC credentials
    if (!HMRC_CLIENT_ID || !HMRC_CLIENT_SECRET) {
      console.error('HMRC credentials not configured');
      return Response.redirect(`${authState.redirect_url}/settings?error=hmrc_not_configured`);
    }

    // Exchange code for tokens
    const callbackUrl = `${authState.redirect_url}/settings?hmrc_callback=true`;
    const tokenResponse = await fetch(`${HMRC_AUTH_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: HMRC_CLIENT_ID,
        client_secret: HMRC_CLIENT_SECRET,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return Response.redirect(`${authState.redirect_url}/settings?error=token_exchange_failed`);
    }

    const tokens = await tokenResponse.json();

    // Encrypt tokens
    const encryptedAccessToken = await encryptToken(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token 
      ? await encryptToken(tokens.refresh_token) 
      : null;

    // Calculate expiry
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 14400) * 1000).toISOString();

    // Update organization HMRC integration
    const { error: updateError } = await supabase
      .from('organization_integrations_hmrc')
      .upsert({
        organization_id: authState.organization_id,
        mtd_vat_connected: true,
        mtd_vat_connected_at: new Date().toISOString(),
        mtd_vat_access_token_encrypted: encryptedAccessToken,
        mtd_vat_refresh_token_encrypted: encryptedRefreshToken,
        mtd_vat_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      });

    if (updateError) {
      console.error('Failed to save tokens:', updateError);
      return Response.redirect(`${authState.redirect_url}/settings?error=save_failed`);
    }

    console.log('HMRC OAuth completed for organization:', authState.organization_id);

    // Redirect back to settings with success
    return Response.redirect(`${authState.redirect_url}/settings/hmrc?hmrc_connected=true`);

  } catch (error) {
    console.error('HMRC callback error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
