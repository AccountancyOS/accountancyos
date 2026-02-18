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
        email_template_id, stop_condition_value, send_count
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
