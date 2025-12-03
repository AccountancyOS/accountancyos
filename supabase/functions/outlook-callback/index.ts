import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    // Create service role client for state validation
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Handle OAuth errors
    if (error) {
      console.error('Microsoft OAuth error:', error, errorDescription);
      return Response.redirect(`${SUPABASE_URL}/settings?error=${encodeURIComponent(error)}`, 302);
    }

    // Validate required params
    if (!code || !state) {
      console.error('Missing code or state');
      return Response.redirect(`${SUPABASE_URL}/settings?error=invalid_request`, 302);
    }

    // Validate state and get user info
    const { data: stateData, error: stateError } = await supabase
      .from('outlook_auth_states')
      .select('*')
      .eq('state', state)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (stateError || !stateData) {
      console.error('Invalid or expired state:', stateError);
      return Response.redirect(`${SUPABASE_URL}/settings?error=invalid_state`, 302);
    }

    // Delete the used state
    await supabase
      .from('outlook_auth_states')
      .delete()
      .eq('id', stateData.id);

    // Build redirect URI (must match what was used in auth request)
    const redirectUri = `${stateData.redirect_url}/auth/outlook/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID!,
        client_secret: MICROSOFT_CLIENT_SECRET!,
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return Response.redirect(`${stateData.redirect_url}/settings?error=token_exchange_failed`, 302);
    }

    const tokens = await tokenResponse.json();

    // Get user's email from Microsoft Graph
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      console.error('Profile fetch failed');
      return Response.redirect(`${stateData.redirect_url}/settings?error=profile_fetch_failed`, 302);
    }

    const profile = await profileResponse.json();
    const emailAddress = profile.mail || profile.userPrincipalName;

    if (!emailAddress) {
      console.error('No email in profile');
      return Response.redirect(`${stateData.redirect_url}/settings?error=no_email`, 302);
    }

    // Calculate token expiry
    const tokenExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

    // Check if mailbox already exists for this user/email
    const { data: existingMailbox } = await supabase
      .from('connected_mailboxes')
      .select('id')
      .eq('user_id', stateData.user_id)
      .eq('email_address', emailAddress)
      .single();

    if (existingMailbox) {
      // Update existing mailbox
      const { error: updateError } = await supabase
        .from('connected_mailboxes')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: tokenExpiresAt,
          status: 'active',
          error_message: null,
          scopes: tokens.scope?.split(' ') || [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingMailbox.id);

      if (updateError) {
        console.error('Update failed:', updateError);
        return Response.redirect(`${stateData.redirect_url}/settings?error=update_failed`, 302);
      }
    } else {
      // Create new mailbox
      const { error: insertError } = await supabase
        .from('connected_mailboxes')
        .insert({
          user_id: stateData.user_id,
          organization_id: stateData.organization_id,
          provider: 'outlook',
          email_address: emailAddress,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: tokenExpiresAt,
          status: 'active',
          sync_enabled: true,
          scopes: tokens.scope?.split(' ') || [],
        });

      if (insertError) {
        console.error('Insert failed:', insertError);
        return Response.redirect(`${stateData.redirect_url}/settings?error=create_failed`, 302);
      }
    }

    console.log('Outlook connected successfully for:', emailAddress);
    return Response.redirect(`${stateData.redirect_url}/settings?outlook_connected=true`, 302);

  } catch (error) {
    console.error('Outlook callback error:', error);
    return Response.redirect(`${SUPABASE_URL}/settings?error=internal_error`, 302);
  }
});
