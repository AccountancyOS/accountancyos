import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error from Google:', error);
      return new Response(null, {
        status: 302,
        headers: { 'Location': `/settings?error=${encodeURIComponent(error)}` }
      });
    }

    if (!code || !state) {
      console.error('Missing code or state');
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/settings?error=invalid_request' }
      });
    }

    // Use service role to validate state and update records
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Validate state and get user info
    const { data: authState, error: stateError } = await supabase
      .from('gmail_auth_states')
      .select('*')
      .eq('state', state)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (stateError || !authState) {
      console.error('Invalid or expired state:', stateError);
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/settings?error=invalid_state' }
      });
    }

    // Delete used state
    await supabase.from('gmail_auth_states').delete().eq('id', authState.id);

    // Exchange code for tokens
    const callbackUrl = `${SUPABASE_URL}/functions/v1/gmail-callback`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: callbackUrl,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/settings?error=token_exchange_failed' }
      });
    }

    const tokens = await tokenResponse.json();
    console.log('Tokens received, scopes:', tokens.scope);

    // Get user's Gmail profile
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileResponse.ok) {
      console.error('Failed to get user profile');
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/settings?error=profile_fetch_failed' }
      });
    }

    const profile = await profileResponse.json();
    const emailAddress = profile.email;

    if (!emailAddress) {
      console.error('No email in profile');
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/settings?error=no_email' }
      });
    }

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

    // Check if mailbox already exists
    const { data: existingMailbox } = await supabase
      .from('connected_mailboxes')
      .select('id')
      .eq('organization_id', authState.organization_id)
      .eq('email_address', emailAddress)
      .single();

    if (existingMailbox) {
      // Update existing mailbox
      const { error: updateError } = await supabase
        .from('connected_mailboxes')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          token_expires_at: expiresAt,
          scopes: tokens.scope?.split(' ') || [],
          status: 'active',
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingMailbox.id);

      if (updateError) {
        console.error('Failed to update mailbox:', updateError);
        return new Response(null, {
          status: 302,
          headers: { 'Location': '/settings?error=update_failed' }
        });
      }

      console.log('Updated existing mailbox:', emailAddress);
    } else {
      // Create new mailbox
      const { error: insertError } = await supabase
        .from('connected_mailboxes')
        .insert({
          organization_id: authState.organization_id,
          user_id: authState.user_id,
          provider: 'gmail',
          email_address: emailAddress,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          token_expires_at: expiresAt,
          scopes: tokens.scope?.split(' ') || [],
          status: 'active',
        });

      if (insertError) {
        console.error('Failed to create mailbox:', insertError);
        return new Response(null, {
          status: 302,
          headers: { 'Location': '/settings?error=create_failed' }
        });
      }

      console.log('Created new mailbox:', emailAddress);
    }

    // Redirect to settings with success
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/settings?gmail_connected=true' }
    });

  } catch (error) {
    console.error('Gmail callback error:', error);
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/settings?error=internal_error' }
    });
  }
});
