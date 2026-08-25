import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildGmailMimeMessage,
  toGmailRawParam,
  validateAttachments,
  type EmailAttachment,
} from "../_shared/attachments.ts";

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
  /**
   * Optional file attachments, base64-encoded. Shape matches what `send-invoice` writes to
   * `email_queue.attachments`, which `process-email-queue` forwards here verbatim.
   * Validated by `validateAttachments` before anything is built — an attachment that cannot
   * be carried correctly refuses the send rather than being dropped from it.
   */
  attachments?: EmailAttachment[];
}

// Refresh access token if expired. Returns Google's actual error on failure.
type RefreshResult =
  | { ok: true; access_token: string; expires_in: number; refresh_token?: string }
  | { ok: false; error: string };

function truncateError(s: string): string {
  return s.length > 500 ? s.slice(0, 500) : s;
}

async function refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
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
    const raw = await response.text();
    if (!response.ok) {
      let detail = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.error || parsed?.error_description) {
          detail = [parsed.error, parsed.error_description].filter(Boolean).join(': ');
        }
      } catch { /* keep raw */ }
      const error = truncateError(`Google token refresh failed (${response.status}): ${detail}`);
      console.error(error);
      return { ok: false, error };
    }
    return { ok: true, ...JSON.parse(raw) };
  } catch (error) {
    const msg = truncateError(`Google token refresh error: ${String(error)}`);
    console.error(msg);
    return { ok: false, error: msg };
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

    // Attachments are validated BEFORE any token refresh or network call. A bad attachment
    // must fail the whole send, loudly and with a specific code — never be quietly omitted
    // from a message that then reports success. The caller (process-email-queue) turns this
    // code into a HOLD on the queue row.
    const hasAttachments = Array.isArray(body.attachments) && body.attachments.length > 0;
    if (body.attachments !== undefined && body.attachments !== null) {
      const validation = validateAttachments(body.attachments, 'gmail');
      if (!validation.ok) {
        return new Response(
          JSON.stringify({ error: validation.code, details: validation.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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

      const refreshResult = await refreshAccessToken(mailbox.refresh_token);
      if (!refreshResult.ok) {
        await serviceSupabase
          .from('connected_mailboxes')
          .update({ status: 'expired', error_message: refreshResult.error })
          .eq('id', mailbox.id);

        return new Response(
          JSON.stringify({ error: refreshResult.error }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      accessToken = refreshResult.access_token;
      const expiresAt = new Date(Date.now() + (refreshResult.expires_in * 1000)).toISOString();
      
      await serviceSupabase
        .from('connected_mailboxes')
        .update({ access_token: accessToken, token_expires_at: expiresAt })
        .eq('id', mailbox.id);
    }

    // Normalize recipients
    const toAddresses = Array.isArray(body.to) ? body.to : [body.to];
    const ccAddresses = body.cc ? (Array.isArray(body.cc) ? body.cc : [body.cc]) : [];
    const bccAddresses = body.bcc ? (Array.isArray(body.bcc) ? body.bcc : [body.bcc]) : [];

    // Create raw email.
    //
    // WITHOUT attachments the original multipart/alternative builder is used unchanged, so
    // every existing send is byte-for-byte what it was before attachment support landed.
    // WITH attachments the message must be multipart/mixed, which is a different structure —
    // built by the pure, unit-tested `_shared/attachments.ts` so the regression suite can
    // decode the emitted MIME and prove the PDF bytes survive it.
    const rawParam = hasAttachments
      ? toGmailRawParam(
          buildGmailMimeMessage({
            from: mailbox.email_address,
            to: toAddresses,
            cc: ccAddresses,
            bcc: bccAddresses,
            subject: body.subject,
            html: body.body_html,
            text: body.body_text || '',
            attachments: body.attachments,
            inReplyTo: body.reply_to_message_id,
          })
        )
      : base64UrlEncode(
          createRawEmail(
            mailbox.email_address,
            toAddresses,
            ccAddresses,
            bccAddresses,
            body.subject,
            body.body_html,
            body.body_text || '',
            body.reply_to_message_id,
            body.thread_id
          )
        );

    // Send via Gmail API
    const sendUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
    const sendBody: any = {
      raw: rawParam,
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
