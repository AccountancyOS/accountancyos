import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID');
const MS_CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface SendEngagementLetterRequest {
  engagement_letter_id: string;
}

// Refresh Google access token
async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
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
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Refresh Microsoft access token
async function refreshMicrosoftToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID!,
        client_secret: MS_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Create RFC 2822 formatted email for Gmail
function createRawEmailGmail(from: string, to: string, subject: string, bodyHtml: string): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const bodyText = bodyHtml.replace(/<[^>]*>/g, '');
  
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  return [
    headers.join('\r\n'),
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    bodyText,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    bodyHtml,
    '',
    `--${boundary}--`,
  ].join('\r\n');
}

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: SendEngagementLetterRequest = await req.json();
    
    if (!body.engagement_letter_id) {
      return new Response(
        JSON.stringify({ error: 'Missing engagement_letter_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userSupabase = createClient(
      SUPABASE_URL!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    
    const serviceSupabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Verify user
    const { data: { user }, error: userError } = await userSupabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch engagement letter with onboarding application data
    const { data: letter, error: letterError } = await serviceSupabase
      .from('engagement_letters')
      .select(`
        *,
        onboarding_application:onboarding_applications(
          id,
          first_name,
          last_name,
          company_name,
          email,
          application_type,
          organization_id
        )
      `)
      .eq('id', body.engagement_letter_id)
      .single();

    if (letterError || !letter) {
      console.error('Engagement letter fetch error:', letterError);
      return new Response(
        JSON.stringify({ error: 'Engagement letter not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const application = letter.onboarding_application;
    if (!application) {
      return new Response(
        JSON.stringify({ error: 'Onboarding application not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to this organization
    const { data: orgAccess } = await userSupabase
      .from('organization_users')
      .select('id')
      .eq('organization_id', application.organization_id)
      .eq('user_id', user.id)
      .single();

    if (!orgAccess) {
      return new Response(
        JSON.stringify({ error: 'Access denied to this organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get organization name for email
    const { data: org } = await serviceSupabase
      .from('organizations')
      .select('name')
      .eq('id', application.organization_id)
      .single();

    const firmName = org?.name || 'Your Accountant';

    // Get connected mailbox for this user
    const { data: mailbox, error: mailboxError } = await userSupabase
      .from('connected_mailboxes')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (mailboxError || !mailbox) {
      return new Response(
        JSON.stringify({ error: 'No connected mailbox found. Please connect Gmail or Outlook in Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare recipient details
    const recipientName = application.application_type === 'individual'
      ? `${application.first_name} ${application.last_name}`
      : application.company_name;
    const recipientEmail = application.email;

    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: 'No recipient email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate signing URL
    const signingUrl = `https://client.accountancyos.com/engagement/${letter.signature_token}`;

    // Build email content
    const subject = `Please sign your engagement letter - ${firmName}`;
    const bodyHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a; margin-bottom: 20px;">Engagement Letter</h2>
        <p style="color: #4a4a4a; line-height: 1.6;">Dear ${recipientName},</p>
        <p style="color: #4a4a4a; line-height: 1.6;">
          Thank you for choosing ${firmName}. Before we can begin working together, we need you to review and sign your engagement letter.
        </p>
        <p style="color: #4a4a4a; line-height: 1.6;">
          This document outlines the services we will provide, our responsibilities, and the terms of our engagement.
        </p>
        <div style="margin: 30px 0; text-align: center;">
          <a href="${signingUrl}" 
             style="display: inline-block; background-color: #2563eb; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 16px;">
            View and Sign Engagement Letter
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          This link will expire in 14 days. If you have any questions, please don't hesitate to contact us.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">
          Sent from ${firmName} via AccountancyOS
        </p>
      </div>
    `;

    let accessToken = mailbox.access_token;
    let sendSuccess = false;
    let sentMessageId: string | null = null;
    let sentThreadId: string | null = null;

    // Check if token needs refresh
    if (mailbox.token_expires_at && new Date(mailbox.token_expires_at) <= new Date()) {
      if (!mailbox.refresh_token) {
        return new Response(
          JSON.stringify({ error: 'Token expired. Please reconnect your mailbox in Settings.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const refreshFn = mailbox.provider === 'outlook' ? refreshMicrosoftToken : refreshGoogleToken;
      const newTokens = await refreshFn(mailbox.refresh_token);
      
      if (!newTokens) {
        await serviceSupabase
          .from('connected_mailboxes')
          .update({ status: 'expired', error_message: 'Token refresh failed' })
          .eq('id', mailbox.id);
        
        return new Response(
          JSON.stringify({ error: 'Token refresh failed. Please reconnect your mailbox in Settings.' }),
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

    // Send email based on provider
    if (mailbox.provider === 'gmail') {
      const rawEmail = createRawEmailGmail(mailbox.email_address, recipientEmail, subject, bodyHtml);
      
      const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: base64UrlEncode(rawEmail) }),
      });

      if (sendResponse.ok) {
        const result = await sendResponse.json();
        sendSuccess = true;
        sentMessageId = result.id;
        sentThreadId = result.threadId;
      } else {
        const errorText = await sendResponse.text();
        console.error('Gmail send failed:', errorText);
      }
    } else if (mailbox.provider === 'outlook') {
      const sendResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: 'HTML', content: bodyHtml },
            toRecipients: [{ emailAddress: { address: recipientEmail, name: recipientName } }],
          },
          saveToSentItems: true,
        }),
      });

      if (sendResponse.ok || sendResponse.status === 202) {
        sendSuccess = true;
        sentMessageId = `outlook-${Date.now()}`;
      } else {
        const errorText = await sendResponse.text();
        console.error('Outlook send failed:', errorText);
      }
    }

    if (!sendSuccess) {
      return new Response(
        JSON.stringify({ error: 'Failed to send email via connected mailbox' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update engagement letter sent_at
    const { error: updateError } = await serviceSupabase
      .from('engagement_letters')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', body.engagement_letter_id);

    if (updateError) {
      console.error('Failed to update sent_at:', updateError);
    }

    // Store sent email in email_messages for conversations timeline
    await serviceSupabase
      .from('email_messages')
      .insert({
        organization_id: application.organization_id,
        mailbox_id: mailbox.id,
        message_id: sentMessageId || `engagement-${body.engagement_letter_id}`,
        thread_id: sentThreadId,
        from_email: mailbox.email_address,
        to_emails: [recipientEmail],
        subject,
        body_html: bodyHtml,
        sent_at: new Date().toISOString(),
        direction: 'outbound',
        is_read: true,
        labels: ['SENT'],
        link_reason: 'engagement_letter',
        link_reference: body.engagement_letter_id,
      });

    console.log(`Engagement letter sent successfully via ${mailbox.provider} to ${recipientEmail}`);

    return new Response(
      JSON.stringify({
        success: true,
        sent_via: mailbox.email_address,
        provider: mailbox.provider,
        message_id: sentMessageId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Send engagement letter error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
