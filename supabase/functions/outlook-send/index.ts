import { serve } from "@std/http";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface SendEmailRequest {
  mailbox_id: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  body_html?: string;
  body_text?: string;
  reply_to_message_id?: string;
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number; refresh_token?: string } | null> {
  try {
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID!,
        client_secret: MICROSOFT_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error('Token refresh failed:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize user client for auth check
    const userSupabase = createClient(
      SUPABASE_URL!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userSupabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: SendEmailRequest = await req.json();
    const { mailbox_id, to, cc, bcc, subject, body_html, body_text, reply_to_message_id } = body;

    if (!mailbox_id || !to || !subject) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: mailbox_id, to, subject' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for mailbox access
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get mailbox and verify ownership
    const { data: mailbox, error: mailboxError } = await supabase
      .from('connected_mailboxes')
      .select('*')
      .eq('id', mailbox_id)
      .eq('user_id', user.id)
      .eq('provider', 'outlook')
      .single();

    if (mailboxError || !mailbox) {
      return new Response(
        JSON.stringify({ error: 'Mailbox not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let accessToken = mailbox.access_token;

    // Check if token needs refresh
    if (mailbox.token_expires_at && new Date(mailbox.token_expires_at) < new Date()) {
      console.log('Refreshing token for send');
      const newTokens = await refreshAccessToken(mailbox.refresh_token);

      if (!newTokens) {
        await supabase
          .from('connected_mailboxes')
          .update({
            status: 'error',
            error_message: 'Token refresh failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', mailbox.id);

        return new Response(
          JSON.stringify({ error: 'Token refresh failed. Please reconnect your Outlook account.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      accessToken = newTokens.access_token;
      await supabase
        .from('connected_mailboxes')
        .update({
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || mailbox.refresh_token,
          token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', mailbox.id);
    }

    // Build recipients
    const toRecipients = (Array.isArray(to) ? to : [to]).map(email => ({
      emailAddress: { address: email }
    }));

    const ccRecipients = cc 
      ? (Array.isArray(cc) ? cc : [cc]).map(email => ({ emailAddress: { address: email } }))
      : undefined;

    const bccRecipients = bcc
      ? (Array.isArray(bcc) ? bcc : [bcc]).map(email => ({ emailAddress: { address: email } }))
      : undefined;

    // Build message body
    const messagePayload: Record<string, unknown> = {
      message: {
        subject,
        body: {
          contentType: body_html ? 'HTML' : 'Text',
          content: body_html || body_text || '',
        },
        toRecipients,
        ...(ccRecipients && { ccRecipients }),
        ...(bccRecipients && { bccRecipients }),
      },
      saveToSentItems: true,
    };

    // Send the email
    const sendResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error('Send failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store sent message in our database
    const toEmailsArray = Array.isArray(to) ? to : [to];
    const ccEmailsArray = cc ? (Array.isArray(cc) ? cc : [cc]) : null;

    const { error: insertError } = await supabase
      .from('email_messages')
      .insert({
        mailbox_id: mailbox.id,
        organization_id: mailbox.organization_id,
        message_id: `sent-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        subject,
        from_email: mailbox.email_address,
        to_emails: toEmailsArray,
        cc_emails: ccEmailsArray,
        body_html: body_html || null,
        body_text: body_text || null,
        direction: 'outbound',
        is_read: true,
        sent_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Failed to store sent message:', insertError);
      // Don't fail the request, email was sent successfully
    }

    console.log(`Email sent via Outlook from ${mailbox.email_address}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Email sent successfully',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Outlook send error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
