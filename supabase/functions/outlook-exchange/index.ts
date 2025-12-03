import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, state, redirect_uri } = await req.json();

    if (!code || !state) {
      return new Response(
        JSON.stringify({ error: 'Missing code or state' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create service role client for state validation
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Validate state
    const { data: stateData, error: stateError } = await supabase
      .from('outlook_auth_states')
      .select('*')
      .eq('state', state)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (stateError || !stateData) {
      console.error('Invalid or expired state:', stateError);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired state' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete the used state
    await supabase
      .from('outlook_auth_states')
      .delete()
      .eq('id', stateData.id);

    // Build redirect URI
    const callbackUri = redirect_uri || `${stateData.redirect_url}/auth/outlook/callback`;

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
        redirect_uri: callbackUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Token exchange failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profile' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const profile = await profileResponse.json();
    const emailAddress = profile.mail || profile.userPrincipalName;

    if (!emailAddress) {
      return new Response(
        JSON.stringify({ error: 'No email address found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate token expiry
    const tokenExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

    // Check if mailbox already exists
    const { data: existingMailbox } = await supabase
      .from('connected_mailboxes')
      .select('id')
      .eq('user_id', stateData.user_id)
      .eq('email_address', emailAddress)
      .single();

    if (existingMailbox) {
      // Update existing
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
        return new Response(
          JSON.stringify({ error: 'Failed to update mailbox' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Create new
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
        return new Response(
          JSON.stringify({ error: 'Failed to create mailbox' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Outlook connected via exchange for:', emailAddress);

    return new Response(
      JSON.stringify({ 
        success: true, 
        email: emailAddress 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Outlook exchange error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
