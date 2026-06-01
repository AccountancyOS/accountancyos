/**
 * chaser-tick: Sends due chaser reminders.
 * Runs every 15 minutes via pg_cron. Uses service role — verify_jwt=false.
 * 
 * 1. Finds ACTIVE chaser runs with next_send_at <= now()
 * 2. Checks stop condition (job status)
 * 3. Creates idempotent message record
 * 4. Inserts into email_queue for actual sending
 * 5. Advances next_send_at
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const BATCH_SIZE = 100;
    let processed = 0;

    // Find due runs
    const { data: dueRuns, error: fetchErr } = await admin
      .from('automation_chaser_runs')
      .select(`
        id, organization_id, job_id, policy_id, status,
        next_send_at, frequency_unit, frequency_interval,
        email_template_id, stop_condition_value, send_count,
        subject_type, subject_id
      `)
      .eq('status', 'ACTIVE')
      .lte('next_send_at', new Date().toISOString())
      .limit(BATCH_SIZE);

    if (fetchErr) {
      console.error('[chaser-tick] Fetch error:', fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!dueRuns || dueRuns.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    for (const run of dueRuns) {
      try {
        // Subject-based runs (Phase 2: lead, quote, engagement_letter, kyc_subject, hmrc_auth)
        if (run.subject_type && run.subject_id) {
          const handled = await processSubjectRun(admin, run);
          if (handled) processed++;
          continue;
        }

        // Job-based runs (Phase 1 — unchanged)
        // 1. Check stop condition — fetch job status
        const { data: job } = await admin
          .from('jobs')
          .select('id, status, job_name, client_id, company_id, organization_id')
          .eq('id', run.job_id)
          .single();

        if (!job) {
          // Job deleted — stop run
          await admin.from('automation_chaser_runs')
            .update({ status: 'STOPPED', next_send_at: null })
            .eq('id', run.id);
          continue;
        }

        // Check if job status matches stop condition
        if (job.status === run.stop_condition_value) {
          await admin.from('automation_chaser_runs')
            .update({ status: 'STOPPED', next_send_at: null })
            .eq('id', run.id);
          // Cancel queued messages
          await admin.from('automation_chaser_messages')
            .update({ status: 'CANCELLED' })
            .eq('chaser_run_id', run.id)
            .eq('status', 'QUEUED');
          continue;
        }

        // 2. Generate idempotency key BEFORE advancing next_send_at
        const idempotencyKey = `${run.organization_id}:${run.id}:${run.next_send_at}`;

        // 3. Resolve recipient email
        let toEmail = '';
        if (job.client_id) {
          const { data: client } = await admin
            .from('clients')
            .select('email')
            .eq('id', job.client_id)
            .single();
          toEmail = client?.email || '';
        }

        // F2: suppression / unsubscribe guard for job-based runs
        if (toEmail && await isSuppressed(admin, run.organization_id, toEmail, run.policy_id)) {
          console.log(`[chaser-tick] Suppressed recipient ${toEmail} for run ${run.id}, stopping`);
          await admin.from('automation_chaser_runs')
            .update({ status: 'STOPPED', next_send_at: null })
            .eq('id', run.id);
          continue;
        }

        if (!toEmail) {
          console.warn(`[chaser-tick] No email for run ${run.id}, job ${run.job_id}`);
          // Still advance to prevent stuck runs
          const nextSend = computeNext(new Date(), run.frequency_unit, run.frequency_interval);
          await admin.from('automation_chaser_runs').update({
            next_send_at: nextSend.toISOString(),
            last_sent_at: new Date().toISOString(),
            send_count: (run.send_count || 0) + 1,
          }).eq('id', run.id);
          continue;
        }

        // 4. Render email template
        let renderedSubject = `Records reminder: ${job.job_name || 'Your job'}`;
        let renderedBody = `<p>This is a reminder to please send your records for ${job.job_name || 'your job'}.</p>`;

        if (run.email_template_id) {
          const { data: template } = await admin
            .from('templates')
            .select('content')
            .eq('id', run.email_template_id)
            .single();

          if (template?.content) {
            const content = typeof template.content === 'string'
              ? JSON.parse(template.content)
              : template.content;
            
            // Fetch client and company for placeholder resolution
            let clientData: Record<string, string> = {};
            let companyData: Record<string, string> = {};
            
            if (job.client_id) {
              const { data: cl } = await admin.from('clients')
                .select('first_name, last_name, email')
                .eq('id', job.client_id).single();
              if (cl) clientData = cl as unknown as Record<string, string>;
            }
            if (job.company_id) {
              const { data: co } = await admin.from('companies')
                .select('company_name, company_number')
                .eq('id', job.company_id).single();
              if (co) companyData = co as unknown as Record<string, string>;
            }

            const rawSubject = content.subject || renderedSubject;
            const rawBody = content.body_html || content.body || renderedBody;

            // Simple placeholder resolution for edge function context
            renderedSubject = resolvePlaceholders(rawSubject, clientData, companyData, job);
            renderedBody = resolvePlaceholders(rawBody, clientData, companyData, job);
          }
        }

        // 5. Insert message with idempotency
        const { data: inserted, error: insertErr } = await admin
          .from('automation_chaser_messages')
          .insert({
            organization_id: run.organization_id,
            job_id: run.job_id,
            chaser_run_id: run.id,
            to_email: toEmail,
            template_id: run.email_template_id,
            rendered_subject: renderedSubject,
            rendered_body: renderedBody,
            status: 'QUEUED',
            send_at: run.next_send_at,
            idempotency_key: idempotencyKey,
          })
          .select('id')
          .single();

        if (insertErr) {
          // Duplicate — already processed this slot
          if (insertErr.code === '23505') {
            console.log(`[chaser-tick] Duplicate idempotency key for run ${run.id}, skipping`);
          } else {
            console.error(`[chaser-tick] Message insert error for run ${run.id}:`, insertErr);
          }
          // Still advance next_send_at to prevent stuck loop
          const nextSend = computeNext(new Date(), run.frequency_unit, run.frequency_interval);
          await admin.from('automation_chaser_runs').update({
            next_send_at: nextSend.toISOString(),
            last_sent_at: new Date().toISOString(),
            send_count: (run.send_count || 0) + 1,
          }).eq('id', run.id);
          continue;
        }

        // 6. Insert into email_queue for actual sending
        let messageStatus = 'SENT';
        let failureReason: string | null = null;

        try {
          // Fetch org for sender info
          const { data: org } = await admin.from('organizations')
            .select('name').eq('id', run.organization_id).single();

          await admin.from('email_queue').insert({
            organization_id: run.organization_id,
            to_email: toEmail,
            subject: renderedSubject,
            body_html: renderedBody,
            status: 'queued',
            source: 'chaser',
            source_id: inserted.id,
            from_name: org?.name || 'AccountancyOS',
          });
        } catch (emailErr: unknown) {
          messageStatus = 'FAILED';
          failureReason = (emailErr as Error).message;
          console.error(`[chaser-tick] Email queue error for run ${run.id}:`, emailErr);
        }

        // 7. Update message status
        await admin.from('automation_chaser_messages').update({
          status: messageStatus,
          sent_at: messageStatus === 'SENT' ? new Date().toISOString() : null,
          failure_reason: failureReason,
        }).eq('id', inserted.id);

        // 8. Advance run
        const nextSend = computeNext(new Date(), run.frequency_unit, run.frequency_interval);
        await admin.from('automation_chaser_runs').update({
          next_send_at: nextSend.toISOString(),
          last_sent_at: new Date().toISOString(),
          send_count: (run.send_count || 0) + 1,
        }).eq('id', run.id);

        processed++;
      } catch (runErr) {
        console.error(`[chaser-tick] Error processing run ${run.id}:`, runErr);
      }
    }

    return new Response(JSON.stringify({ processed, total: dueRuns.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[chaser-tick] Fatal error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Subject-based chaser processor (Phase 2).
 * Handles lead, quote, engagement_letter, kyc_subject, hmrc_auth subjects.
 * Returns true if a send slot was processed (sent / queued / advanced), false on early exit.
 */
async function processSubjectRun(admin: any, run: any): Promise<boolean> {
  const { subject_type, subject_id, organization_id, id: runId } = run;

  // 1. Resolve subject + stop condition + recipient
  let stop = false;
  let toEmail = '';
  let subjectLabel = subject_type;
  let clientData: Record<string, string> = {};
  let companyData: Record<string, string> = {};

  try {
    if (subject_type === 'lead') {
      const { data } = await admin
        .from('leads')
        .select('id, pipeline_stage, email, first_name, last_name, converted_at, lost_at')
        .eq('id', subject_id).maybeSingle();
      if (!data) stop = true;
      else {
        toEmail = data.email || '';
        subjectLabel = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || 'Lead';
        clientData = { first_name: data.first_name || '', last_name: data.last_name || '', email: toEmail };
        if (data.converted_at || data.lost_at) stop = true;
        if (['won','lost','converted','dormant'].includes((data.pipeline_stage || '').toLowerCase())) stop = true;
      }
    } else if (subject_type === 'quote') {
      const { data } = await admin
        .from('quotes')
        .select('id, status, ported_to_client_id, quote_number, lead_id, client_id')
        .eq('id', subject_id).maybeSingle();
      if (!data) stop = true;
      else {
        subjectLabel = data.quote_number || 'Quote';
        if (['accepted','rejected','expired','withdrawn'].includes((data.status || '').toLowerCase()) || data.ported_to_client_id) stop = true;
        if (data.lead_id) {
          const { data: lead } = await admin.from('leads')
            .select('email, first_name, last_name')
            .eq('id', data.lead_id).maybeSingle();
          if (lead) {
            toEmail = lead.email || '';
            clientData = { first_name: lead.first_name || '', last_name: lead.last_name || '', email: toEmail };
          }
        }
        if (!toEmail && data.client_id) {
          const { data: cl } = await admin.from('clients')
            .select('email, first_name, last_name').eq('id', data.client_id).maybeSingle();
          if (cl) {
            toEmail = cl.email || '';
            clientData = cl as any;
          }
        }
      }
    } else if (subject_type === 'engagement_letter') {
      const { data } = await admin
        .from('engagement_letters')
        .select('id, signed_at, onboarding_application_id')
        .eq('id', subject_id).maybeSingle();
      if (!data) stop = true;
      else {
        if (data.signed_at) stop = true;
        if (data.onboarding_application_id) {
          const { data: app } = await admin.from('onboarding_applications')
            .select('client_id').eq('id', data.onboarding_application_id).maybeSingle();
          if (app?.client_id) {
            const { data: cl } = await admin.from('clients')
              .select('email, first_name, last_name').eq('id', app.client_id).maybeSingle();
            if (cl) { toEmail = cl.email || ''; clientData = cl as any; }
          }
        }
      }
    } else if (subject_type === 'kyc_subject') {
      const { data } = await admin
        .from('kyc_pack_subjects')
        .select('id, subject_status, subject_name, kyc_pack_id')
        .eq('id', subject_id).maybeSingle();
      if (!data) stop = true;
      else {
        subjectLabel = data.subject_name || 'KYC subject';
        if (['complete','waived'].includes((data.subject_status || '').toLowerCase())) stop = true;
        if (data.kyc_pack_id) {
          const { data: pack } = await admin.from('kyc_packs')
            .select('client_id').eq('id', data.kyc_pack_id).maybeSingle();
          if (pack?.client_id) {
            const { data: cl } = await admin.from('clients')
              .select('email, first_name, last_name').eq('id', pack.client_id).maybeSingle();
            if (cl) { toEmail = cl.email || ''; clientData = cl as any; }
          }
        }
      }
    } else if (subject_type === 'hmrc_auth') {
      const { data } = await admin
        .from('client_tax_authorisations')
        .select('id, status, client_id, tax_service_type')
        .eq('id', subject_id).maybeSingle();
      if (!data) stop = true;
      else {
        subjectLabel = `HMRC ${data.tax_service_type || ''}`.trim();
        if (['active','revoked','expired'].includes((data.status || '').toLowerCase())) stop = true;
        if (data.client_id) {
          const { data: cl } = await admin.from('clients')
            .select('email, first_name, last_name').eq('id', data.client_id).maybeSingle();
          if (cl) { toEmail = cl.email || ''; clientData = cl as any; }
        }
      }
    } else {
      // Unknown subject type — stop quietly
      stop = true;
    }
  } catch (err) {
    console.error(`[chaser-tick:subject] Resolve error for run ${runId}:`, err);
    return false;
  }

  if (stop) {
    await admin.from('automation_chaser_runs')
      .update({ status: 'STOPPED', next_send_at: null })
      .eq('id', runId);
    await admin.from('automation_chaser_messages')
      .update({ status: 'CANCELLED' })
      .eq('chaser_run_id', runId)
      .eq('status', 'QUEUED');
    return true;
  }

  const idempotencyKey = `${organization_id}:${runId}:${run.next_send_at}`;

  // Always advance next_send_at to prevent stuck loops on missing recipient
  const advance = async () => {
    const nextSend = computeNext(new Date(), run.frequency_unit, run.frequency_interval);
    await admin.from('automation_chaser_runs').update({
      next_send_at: nextSend.toISOString(),
      last_sent_at: new Date().toISOString(),
      send_count: (run.send_count || 0) + 1,
    }).eq('id', runId);
  };

  if (!toEmail) {
    console.warn(`[chaser-tick:subject] No recipient for ${subject_type} ${subject_id}`);
    await advance();
    return true;
  }

  // Render template
  let renderedSubject = `Reminder: ${subjectLabel}`;
  let renderedBody = `<p>This is a reminder regarding ${subjectLabel}.</p>`;

  if (run.email_template_id) {
    const { data: template } = await admin
      .from('templates').select('content').eq('id', run.email_template_id).maybeSingle();
    if (template?.content) {
      const content = typeof template.content === 'string' ? JSON.parse(template.content) : template.content;
      renderedSubject = resolvePlaceholders(content.subject || renderedSubject, clientData, companyData, { job_name: subjectLabel });
      renderedBody = resolvePlaceholders(content.body_html || content.body || renderedBody, clientData, companyData, { job_name: subjectLabel });
    }
  }

  const { data: inserted, error: insertErr } = await admin
    .from('automation_chaser_messages')
    .insert({
      organization_id,
      job_id: null,
      subject_type,
      subject_id,
      chaser_run_id: runId,
      to_email: toEmail,
      template_id: run.email_template_id,
      rendered_subject: renderedSubject,
      rendered_body: renderedBody,
      status: 'QUEUED',
      send_at: run.next_send_at,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single();

  if (insertErr) {
    if (insertErr.code !== '23505') {
      console.error(`[chaser-tick:subject] Insert error for run ${runId}:`, insertErr);
    }
    await advance();
    return true;
  }

  let messageStatus = 'SENT';
  let failureReason: string | null = null;
  try {
    const { data: org } = await admin.from('organizations').select('name').eq('id', organization_id).single();
    await admin.from('email_queue').insert({
      organization_id,
      to_email: toEmail,
      subject: renderedSubject,
      body_html: renderedBody,
      status: 'queued',
      source: `chaser:${subject_type}`,
      source_id: inserted.id,
      from_name: org?.name || 'AccountancyOS',
    });
  } catch (emailErr: unknown) {
    messageStatus = 'FAILED';
    failureReason = (emailErr as Error).message;
    console.error(`[chaser-tick:subject] Email queue error for run ${runId}:`, emailErr);
  }

  await admin.from('automation_chaser_messages').update({
    status: messageStatus,
    sent_at: messageStatus === 'SENT' ? new Date().toISOString() : null,
    failure_reason: failureReason,
  }).eq('id', inserted.id);

  await advance();
  return true;
}

function computeNext(from: Date, unit: string, interval: number): Date {
  const d = new Date(from);
  switch (unit) {
    case 'DAY': d.setDate(d.getDate() + interval); break;
    case 'WEEK': d.setDate(d.getDate() + interval * 7); break;
    case 'MONTH': d.setMonth(d.getMonth() + interval); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d;
}

function resolvePlaceholders(
  text: string,
  client: Record<string, string>,
  company: Record<string, string>,
  job: Record<string, unknown>
): string {
  if (!text) return text;
  return text
    .replace(/\{\{client\.first_name\}\}/g, client.first_name || '')
    .replace(/\{\{client\.last_name\}\}/g, client.last_name || '')
    .replace(/\{\{client\.name\}\}/g, `${client.first_name || ''} ${client.last_name || ''}`.trim())
    .replace(/\{\{client\.email\}\}/g, client.email || '')
    .replace(/\{\{company\.name\}\}/g, (company as any).company_name || '')
    .replace(/\{\{company\.number\}\}/g, (company as any).company_number || '')
    .replace(/\{\{job\.name\}\}/g, (job.job_name as string) || '')
    .replace(/\{\{job\.status\}\}/g, (job.status as string) || '');
}
