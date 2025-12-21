import { serve } from "@std/http";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate environment
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('Google OAuth credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Google OAuth not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { code, state } = await req.json();

    if (!code || !state) {
      return new Response(
        JSON.stringify({ error: 'Missing code or state' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client to validate state and store tokens
    const supabase = createClient(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!
    );

    // Validate state token
    const { data: authState, error: stateError } = await supabase
      .from('gmail_auth_states')
      .select('*')
      .eq('state', state)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (stateError || !authState) {
      console.error('Invalid or expired state:', stateError);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired state' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete used state
    await supabase.from('gmail_auth_states').delete().eq('id', authState.id);

    // Build the redirect URI - must match what was sent to Google
    const redirectUri = `${authState.redirect_url}/auth/gmail/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Token exchange failed', details: errorText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokens = await tokenResponse.json();

    // Get user profile to get email
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileResponse.ok) {
      console.error('Failed to get user profile');
      return new Response(
        JSON.stringify({ error: 'Failed to get user profile' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const profile = await profileResponse.json();
    const email = profile.email;

    if (!email) {
      console.error('No email in profile');
      return new Response(
        JSON.stringify({ error: 'No email in profile' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if mailbox already exists for this user
    const { data: existingMailbox } = await supabase
      .from('connected_mailboxes')
      .select('id')
      .eq('user_id', authState.user_id)
      .eq('email_address', email)
      .single();

    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    if (existingMailbox) {
      // Update existing mailbox
      const { error: updateError } = await supabase
        .from('connected_mailboxes')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          token_expires_at: tokenExpiresAt,
          status: 'active',
          error_message: null,
          scopes: tokens.scope ? tokens.scope.split(' ') : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingMailbox.id);

      if (updateError) {
        console.error('Failed to update mailbox:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update mailbox' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Updated existing mailbox for:', email);
    } else {
      // Create new mailbox
      const { error: insertError } = await supabase
        .from('connected_mailboxes')
        .insert({
          user_id: authState.user_id,
          organization_id: authState.organization_id,
          email_address: email,
          provider: 'gmail',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          token_expires_at: tokenExpiresAt,
          status: 'active',
          scopes: tokens.scope ? tokens.scope.split(' ') : null,
        });

      if (insertError) {
        console.error('Failed to create mailbox:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to create mailbox' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Created new mailbox for:', email);
    }

    return new Response(
      JSON.stringify({ success: true, email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Gmail exchange error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
