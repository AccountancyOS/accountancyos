import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface SendEmailRequest {
  mailbox_id: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  body_html: string;
  body_text?: string;
  reply_to_message_id?: string;
  thread_id?: string;
  client_id?: string;
  company_id?: string;
}

// Refresh access token if expired
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
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

// Create RFC 2822 formatted email
function createRawEmail(
  from: string,
  to: string[],
  cc: string[],
  bcc: string[],
  subject: string,
  bodyHtml: string,
  bodyText: string,
  replyToMessageId?: string,
  threadId?: string
): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  let headers = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
  ];

  if (cc.length > 0) {
    headers.push(`Cc: ${cc.join(', ')}`);
  }

  if (bcc.length > 0) {
    headers.push(`Bcc: ${bcc.join(', ')}`);
  }

  headers.push(`Subject: ${subject}`);
  headers.push(`MIME-Version: 1.0`);
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  if (replyToMessageId) {
    headers.push(`In-Reply-To: ${replyToMessageId}`);
    headers.push(`References: ${replyToMessageId}`);
  }

  const message = [
    headers.join('\r\n'),
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    bodyText || bodyHtml.replace(/<[^>]*>/g, ''),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    bodyHtml,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  return message;
}

// Base64url encode
function base64UrlEncode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
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

    // Parse request body
    const body: SendEmailRequest = await req.json();
    
    if (!body.mailbox_id || !body.to || !body.subject || !body.body_html) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: mailbox_id, to, subject, body_html' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase clients
    const userSupabase = createClient(
      SUPABASE_URL!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    
    const serviceSupabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Detect internal service-role call (used by process-email-queue dispatcher)
    const bearer = authHeader.replace(/^Bearer\s+/i, '');
    const isInternalCall = bearer === SUPABASE_SERVICE_ROLE_KEY;

    let mailboxQuery = serviceSupabase
      .from('connected_mailboxes')
      .select('*')
      .eq('id', body.mailbox_id);

    if (!isInternalCall) {
      // Verify user owns the mailbox
      const { data: { user }, error: userError } = await userSupabase.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      mailboxQuery = mailboxQuery.eq('user_id', user.id);
    }

    const { data: mailbox, error: mailboxError } = await mailboxQuery.single();

    if (mailboxError || !mailbox) {
      return new Response(
        JSON.stringify({ error: 'Mailbox not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mailbox.status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'Mailbox is not active. Please reconnect.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let accessToken = mailbox.access_token;

    // Check if token needs refresh
    if (mailbox.token_expires_at && new Date(mailbox.token_expires_at) <= new Date()) {
      if (!mailbox.refresh_token) {
        await serviceSupabase
          .from('connected_mailboxes')
          .update({ status: 'expired', error_message: 'Token expired, no refresh token' })
          .eq('id', mailbox.id);
        
        return new Response(
          JSON.stringify({ error: 'Token expired. Please reconnect your mailbox.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const newTokens = await refreshAccessToken(mailbox.refresh_token);
      if (!newTokens) {
        await serviceSupabase
          .from('connected_mailboxes')
          .update({ status: 'expired', error_message: 'Token refresh failed' })
          .eq('id', mailbox.id);
        
        return new Response(
          JSON.stringify({ error: 'Token refresh failed. Please reconnect your mailbox.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      accessToken = newTokens.access_token;
      const expiresAt = new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString();
      
      await serviceSupabase
        .from('connected_mailboxes')
        .update({ access_token: accessToken, token_expires_at: expiresAt })
        .eq('id', mailbox.id);
    }

    // Normalize recipients
    const toAddresses = Array.isArray(body.to) ? body.to : [body.to];
    const ccAddresses = body.cc ? (Array.isArray(body.cc) ? body.cc : [body.cc]) : [];
    const bccAddresses = body.bcc ? (Array.isArray(body.bcc) ? body.bcc : [body.bcc]) : [];

    // Create raw email
    const rawEmail = createRawEmail(
      mailbox.email_address,
      toAddresses,
      ccAddresses,
      bccAddresses,
      body.subject,
      body.body_html,
      body.body_text || '',
      body.reply_to_message_id,
      body.thread_id
    );

    // Send via Gmail API
    const sendUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
    const sendBody: any = {
      raw: base64UrlEncode(rawEmail),
    };

    if (body.thread_id) {
      sendBody.threadId = body.thread_id;
    }

    const sendResponse = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sendBody),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error('Gmail send failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sentMessage = await sendResponse.json();
    console.log('Email sent:', sentMessage.id);

    // Store sent email in our database
    const { error: insertError } = await serviceSupabase
      .from('email_messages')
      .insert({
        organization_id: mailbox.organization_id,
        mailbox_id: mailbox.id,
        thread_id: sentMessage.threadId,
        message_id: sentMessage.id,
        from_email: mailbox.email_address,
        to_emails: toAddresses,
        cc_emails: ccAddresses,
        subject: body.subject,
        body_html: body.body_html,
        body_text: body.body_text,
        sent_at: new Date().toISOString(),
        direction: 'outbound',
        is_read: true,
        labels: ['SENT'],
        client_id: body.client_id,
        company_id: body.company_id,
        matched_at: body.client_id || body.company_id ? new Date().toISOString() : null,
        matched_by: body.client_id || body.company_id ? 'manual' : null,
      });

    if (insertError) {
      console.error('Failed to store sent email:', insertError);
      // Don't fail the request - email was sent successfully
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id: sentMessage.id,
        thread_id: sentMessage.threadId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Gmail send error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
