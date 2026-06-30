import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface SendEngagementLetterRequest {
  engagement_letter_id: string;
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
          organization_id,
          client_id
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

    // Prepare recipient details — always prefer the personal name (preferred_name, then first+last)
    // and only fall back to company_name when no personal name is available.
    let preferredName: string | null = null;
    if (application.client_id) {
      const { data: client } = await serviceSupabase
        .from('clients')
        .select('preferred_name')
        .eq('id', application.client_id)
        .maybeSingle();
      preferredName = client?.preferred_name?.trim() || null;
    }
    const fullName = `${application.first_name ?? ''} ${application.last_name ?? ''}`.trim();
    const recipientName = preferredName || fullName || application.company_name;
    const recipientEmail = application.email;

    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: 'No recipient email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate signing URL
    const signingUrl = `https://client.accountancyos.com/engagement/${letter.signature_token}`;

    // Attempt to resolve an org-specific engagement letter variant.
    // Falls back to default wording if no active variant matches.
    const clientTypeHint = application.application_type === 'individual' ? 'individual' : 'limited_company';
    let variantSubject: string | null = null;
    let variantBody: string | null = null;
    try {
      const { data: variantId } = await serviceSupabase.rpc('resolve_engagement_letter_variant', {
        p_organization_id: application.organization_id,
        p_client_type: clientTypeHint,
        p_service_code: null,
        p_legal_entity: null,
        p_engagement_kind: 'recurring',
      });
      if (variantId) {
        const { data: variant } = await serviceSupabase
          .from('engagement_letter_template_variants')
          .select('subject, body')
          .eq('id', variantId)
          .maybeSingle();
        if (variant) {
          const replace = (s: string) => s
            .replaceAll('{{recipient_name}}', recipientName ?? '')
            .replaceAll('{{client.name}}', recipientName ?? '')
            .replaceAll('{{firm_name}}', firmName)
            .replaceAll('{{firm.name}}', firmName)
            .replaceAll('{{signing_url}}', signingUrl);
          variantSubject = replace(variant.subject);
          variantBody = replace(variant.body);
        }
      }
    } catch (e) {
      console.warn('Variant resolution failed, using default wording:', e);
    }

    // Build email content (variant if resolved, else default)
    const subject = variantSubject ?? `Please sign your engagement letter - ${firmName}`;
    const bodyHtml = variantBody ?? `
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

    // Enqueue via the canonical email pipeline. process-email-queue performs the
    // actual mailbox send (token refresh, retry, audit, email_messages history), so
    // engagement letters no longer bypass the queue. Routed to the user's connected
    // mailbox via mailbox_id + provider.
    const { error: enqueueError } = await serviceSupabase
      .from('email_queue')
      .insert({
        organization_id: application.organization_id,
        mailbox_id: mailbox.id,
        provider: mailbox.provider,
        to_email: recipientEmail,
        to_name: recipientName,
        subject,
        body_html: bodyHtml,
        client_id: application.client_id ?? null,
        company_id: application.company_id ?? null,
        context: 'engagement',
        entity_type: 'engagement_letter',
        entity_id: body.engagement_letter_id,
        status: 'pending',
      });

    if (enqueueError) {
      console.error('Failed to enqueue engagement letter email:', enqueueError);
      return new Response(
        JSON.stringify({ error: 'Failed to queue engagement letter email' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark the letter as sent/queued.
    const { error: updateError } = await serviceSupabase
      .from('engagement_letters')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', body.engagement_letter_id);
    if (updateError) console.error('Failed to update sent_at:', updateError);

    console.log(`Engagement letter queued via ${mailbox.provider} to ${recipientEmail}`);

    return new Response(
      JSON.stringify({ success: true, queued: true, provider: mailbox.provider }),
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
