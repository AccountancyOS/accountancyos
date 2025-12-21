import { serve } from "@std/http";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HMRC OAuth configuration
const HMRC_AUTH_URL = Deno.env.get('HMRC_AUTH_URL') || 'https://test-api.service.hmrc.gov.uk';
const HMRC_CLIENT_ID = Deno.env.get('HMRC_CLIENT_ID');
const HMRC_CLIENT_SECRET = Deno.env.get('HMRC_CLIENT_SECRET');
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY') || 'default-dev-key-change-in-production';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Simple encryption using Web Crypto API
async function encryptValue(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    data
  );
  
  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedBuffer), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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
    const encryptedAccessToken = await encryptValue(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token 
      ? await encryptValue(tokens.refresh_token) 
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
