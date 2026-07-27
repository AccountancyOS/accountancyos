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

/** One signer as captured on the proposal — see src/lib/proposal/signatories.ts. */
interface ProposalSignatory {
  person_id?: string | null;
  contact_id?: string | null;
  ch_officer_id?: string | null;
  name?: string | null;
  email?: string | null;
  is_primary?: boolean;
  required?: boolean;
}

interface SignatorySnapshot {
  rule?: string | null;
  signatories?: ProposalSignatory[] | null;
}

/** A seeded signatory row (the columns this function reads). */
interface SignatoryRow {
  id: string;
  signer_email: string;
  signer_name: string | null;
  signature_token: string | null;
  signed_at: string | null;
  required: boolean;
}

/** A person this dispatch will email, with the token that identifies them. */
interface Recipient {
  email: string;
  name: string | null;
  /** Per-signatory token (Phase 2 T2d) or, for legacy letters, the letter token. */
  token: string;
  /** Null on the legacy single-recipient path. */
  signatoryId: string | null;
}

const normaliseEmail = (email: string | null | undefined) =>
  (email ?? '').trim().toLowerCase();

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
          client_id,
          company_id,
          quote_id,
          access_token
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

    // ── Phase 2 T2d-3: per-signatory links ────────────────────────────────────
    // The proposal carries its own immutable signatory snapshot. Each signatory gets
    // their OWN row (and therefore their own signature_token) and their own email, so
    // the signing rule can tell who has signed. Letters with no snapshot keep the
    // legacy single-recipient behaviour untouched.
    let snapshot: SignatorySnapshot | null = null;
    if (application.quote_id) {
      const { data: quote } = await serviceSupabase
        .from('quotes')
        .select('signatory_snapshot')
        .eq('id', application.quote_id)
        .maybeSingle();
      snapshot = (quote?.signatory_snapshot as SignatorySnapshot | null) ?? null;
    }

    const snapshotSignatories = (snapshot?.signatories ?? []).filter(
      (s) => normaliseEmail(s?.email).length > 0,
    );

    let recipients: Recipient[] = [];
    let signingRule: string = letter.signing_rule ?? 'all';

    if (snapshotSignatories.length > 0) {
      // The proposal's rule is authoritative until the letter is signed.
      signingRule = snapshot?.rule === 'any' ? 'any' : 'all';
      if (!letter.signed_at && letter.signing_rule !== signingRule) {
        const { error: ruleError } = await serviceSupabase
          .from('engagement_letters')
          .update({ signing_rule: signingRule, updated_at: new Date().toISOString() })
          .eq('id', body.engagement_letter_id);
        if (ruleError) {
          console.error('Failed to set signing_rule:', ruleError);
          return new Response(
            JSON.stringify({ error: 'Failed to apply the signing rule to this engagement letter' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const { data: existingRows, error: existingError } = await serviceSupabase
        .from('engagement_letter_signatories')
        .select('id, signer_email, signer_name, signature_token, signed_at, required')
        .eq('engagement_letter_id', body.engagement_letter_id);

      if (existingError) {
        console.error('Failed to read existing signatories:', existingError);
        return new Response(
          JSON.stringify({ error: 'Failed to read the signatories for this engagement letter' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const existing: SignatoryRow[] = existingRows ?? [];
      const existingByEmail = new Map(
        existing.map((r: SignatoryRow) => [normaliseEmail(r.signer_email), r]),
      );
      const snapshotEmails = new Set(snapshotSignatories.map((s) => normaliseEmail(s.email)));

      // Seeding is idempotent: a resend never re-issues a token a client already holds,
      // and never touches a row that has been signed.
      const toInsert = snapshotSignatories
        .filter((s) => !existingByEmail.has(normaliseEmail(s.email)))
        .map((s) => ({
          organization_id: application.organization_id,
          engagement_letter_id: body.engagement_letter_id,
          onboarding_application_id: application.id,
          person_id: s.person_id ?? null,
          contact_id: s.contact_id ?? null,
          signer_name: (s.name ?? '').trim() || null,
          signer_email: (s.email ?? '').trim(),
          required: s.required !== false,
        }));

      let inserted: typeof existing = [];
      if (toInsert.length > 0) {
        const { data: insertedRows, error: insertError } = await serviceSupabase
          .from('engagement_letter_signatories')
          .insert(toInsert)
          .select('id, signer_email, signer_name, signature_token, signed_at, required');

        if (insertError) {
          console.error('Failed to seed signatories:', insertError);
          return new Response(
            JSON.stringify({ error: 'Failed to create the signatories for this engagement letter' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        inserted = insertedRows ?? [];
      }

      // A signatory the accountant has since removed from the proposal must not keep an
      // 'all' letter permanently unsatisfiable. Only UNSIGNED rows are removed; a
      // recorded signature is never deleted.
      const staleIds = existing
        .filter((r) => !r.signed_at && !snapshotEmails.has(normaliseEmail(r.signer_email)))
        .map((r) => r.id);
      if (staleIds.length > 0) {
        const { error: deleteError } = await serviceSupabase
          .from('engagement_letter_signatories')
          .delete()
          .in('id', staleIds);
        if (deleteError) {
          console.error('Failed to remove signatories dropped from the proposal:', deleteError);
          return new Response(
            JSON.stringify({ error: 'Failed to reconcile the signatories for this engagement letter' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.log(`Removed ${staleIds.length} unsigned signatory row(s) no longer on the proposal`);
      }

      const live = [...existing.filter((r) => !staleIds.includes(r.id)), ...inserted];

      // Already-signed signatories are not chased again.
      recipients = live
        .filter((r) => !r.signed_at && r.signature_token)
        .map((r) => ({
          email: r.signer_email,
          name: r.signer_name,
          token: r.signature_token as string,
          signatoryId: r.id,
        }));

      if (recipients.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            queued: false,
            already_signed: true,
            signatory_count: live.length,
            message: 'Every signatory on this engagement letter has already signed.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Legacy path: one letter-level link to the application's email address.
      if (!application.email) {
        return new Response(
          JSON.stringify({ error: 'No recipient email address' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!letter.signature_token) {
        return new Response(
          JSON.stringify({ error: 'This engagement letter has no signing token' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      recipients = [{
        email: application.email,
        name: recipientName,
        token: letter.signature_token,
        signatoryId: null,
      }];
    }

    // ── The letter must have content before anyone is asked to sign it ────────
    // engagement_letters rows created by the staff Send button carry
    // document_content = NULL: historically only the in-portal signing RPC ever
    // generated the wording, at the moment of signing. The emailed link therefore
    // presented an empty document. Render it here through the SAME builder the client
    // portal uses (public_preview_engagement_letter → resolve_engagement_letter_variant
    // → render_engagement_letter_body) so there is never a second copy of the wording.
    // Signed letters are left untouched — their content is frozen evidence.
    if (!letter.document_content && !letter.signed_at) {
      const { data: rendered, error: renderError } = await serviceSupabase.rpc(
        'public_preview_engagement_letter',
        {
          p_application_id: application.id,
          p_access_token: application.access_token ?? null,
        },
      );

      if (renderError || !rendered) {
        console.error('Failed to render engagement letter content:', renderError);
        return new Response(
          JSON.stringify({
            error: 'Could not generate the engagement letter wording. Check the accepted proposal and engagement letter variants, then try again.',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: contentError } = await serviceSupabase
        .from('engagement_letters')
        .update({ document_content: rendered, updated_at: new Date().toISOString() })
        .eq('id', body.engagement_letter_id);

      if (contentError) {
        console.error('Failed to store engagement letter content:', contentError);
        return new Response(
          JSON.stringify({ error: 'Could not save the engagement letter wording' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

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
          variantSubject = variant.subject;
          variantBody = variant.body;
        }
      }
    } catch (e) {
      console.warn('Variant resolution failed, using default wording:', e);
    }

    // Merge fields are rendered PER RECIPIENT so each signatory is addressed by name and
    // gets their own signing link.
    const renderTemplate = (template: string, to: Recipient, signingUrl: string) =>
      template
        .replaceAll('{{recipient_name}}', to.name ?? '')
        .replaceAll('{{client.name}}', to.name ?? recipientName ?? '')
        .replaceAll('{{firm_name}}', firmName)
        .replaceAll('{{firm.name}}', firmName)
        .replaceAll('{{signing_url}}', signingUrl);

    const coSignerNote = recipients.length > 1
      ? `<p style="color: #4a4a4a; line-height: 1.6;">This engagement letter is being signed by ${recipients.length} people${
          signingRule === 'any' ? ', and any one signature completes it' : ', and we need each of them to sign'
        }. The link below is personal to you — please don't forward it.</p>`
      : '';

    const defaultBody = (to: Recipient, signingUrl: string) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a; margin-bottom: 20px;">Engagement Letter</h2>
        <p style="color: #4a4a4a; line-height: 1.6;">Dear ${to.name ?? recipientName},</p>
        <p style="color: #4a4a4a; line-height: 1.6;">
          Thank you for choosing ${firmName}. Before we can begin working together, we need you to review and sign your engagement letter.
        </p>
        <p style="color: #4a4a4a; line-height: 1.6;">
          This document outlines the services we will provide, our responsibilities, and the terms of our engagement.
        </p>
        ${coSignerNote}
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
    const today = new Date().toISOString().slice(0, 10);
    const rows = recipients.map((to) => {
      const signingUrl = `https://client.accountancyos.com/engagement/${to.token}`;
      return {
        organization_id: application.organization_id,
        mailbox_id: mailbox.id,
        provider: mailbox.provider,
        to_email: to.email,
        to_name: to.name,
        subject: variantSubject
          ? renderTemplate(variantSubject, to, signingUrl)
          : `Please sign your engagement letter - ${firmName}`,
        body_html: variantBody
          ? renderTemplate(variantBody, to, signingUrl)
          : defaultBody(to, signingUrl),
        client_id: application.client_id ?? null,
        company_id: application.company_id ?? null,
        context: 'engagement',
        entity_type: 'engagement_letter',
        entity_id: body.engagement_letter_id,
        // FUN-4/Fix 10: idempotency key dedups an accidental double-send of the same engagement
        // letter on the same day (double-click / retry); a deliberate later resend gets a new key.
        // T2d-3: keyed per SIGNATORY so co-signers are not deduped against each other.
        idempotency_key: to.signatoryId
          ? `engagement-letter:${body.engagement_letter_id}:${to.signatoryId}:${today}`
          : `engagement-letter:${body.engagement_letter_id}:${today}`,
        status: 'pending',
      };
    });

    const { error: enqueueError } = await serviceSupabase
      .from('email_queue')
      .upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true });

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

    console.log(
      `Engagement letter queued via ${mailbox.provider} to ${recipients.length} recipient(s)`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        queued: true,
        provider: mailbox.provider,
        // The onboarding UI reads sent_via for its confirmation toast.
        sent_via: mailbox.provider,
        recipient_count: recipients.length,
        signing_rule: signingRule,
        per_signatory: recipients.some((r) => r.signatoryId !== null),
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
