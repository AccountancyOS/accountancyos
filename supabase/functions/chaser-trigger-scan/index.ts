/**
 * chaser-trigger-scan: Finds entities whose period triggers have fired,
 * ensures jobs exist for those periods, and starts chaser runs.
 * 
 * Runs every 6 hours via pg_cron. Uses service role — verify_jwt=false.
 * Skips MANUAL trigger policies (those are started by accountants in UI).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Service code → jobs.service_type mapping
const SERVICE_CODE_TO_TYPE: Record<string, string> = {
  'CT600': 'corporation_tax',
  'SA-RETURN': 'self_assessment',
  'SA-MTD-QUARTERLY': 'self_assessment',
  'SA-MTD-ANNUAL': 'self_assessment',
  'VAT-RETURN': 'vat',
  'ANNUAL-ACC': 'accounts',
  'CONFIRM-STMT': 'confirmation_statement',
  'PAYROLL': 'payroll',
  'BK-MONTHLY': 'bookkeeping',
  'BK-ANNUAL': 'bookkeeping',
  'CGT': 'cgt',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // FUN-2/Fix: cron-only worker (verify_jwt=false). Require the service-role key so it is not
  // anonymously invokable. The pg_cron job sends it as the bearer.
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (bearer !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    let totalProcessed = 0;

    // 1. Fetch all enabled, non-MANUAL policies
    const { data: policies, error: polErr } = await admin
      .from('automation_chaser_policies')
      .select('*')
      .eq('is_enabled', true)
      .neq('trigger_type', 'MANUAL');

    if (polErr) {
      console.error('[trigger-scan] Policy fetch error:', polErr);
      return new Response(JSON.stringify({ error: polErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!policies || policies.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No enabled policies' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group policies by org for efficient processing
    const byOrg: Record<string, typeof policies> = {};
    for (const p of policies) {
      (byOrg[p.organization_id] ||= []).push(p);
    }

    for (const [orgId, orgPolicies] of Object.entries(byOrg)) {
      for (const policy of orgPolicies) {
        try {
          const count = await processPolicy(admin, orgId, policy, today, todayStr);
          totalProcessed += count;
        } catch (err) {
          console.error(`[trigger-scan] Error processing policy ${policy.id}:`, err);
        }
      }
    }

    return new Response(JSON.stringify({ processed: totalProcessed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[trigger-scan] Fatal error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ---------------------------------------------------------------------------
// Process a single policy across all relevant entities
// ---------------------------------------------------------------------------

async function processPolicy(
  admin: ReturnType<typeof createClient>,
  orgId: string,
  policy: any,
  today: Date,
  todayStr: string
): Promise<number> {
  const serviceType = SERVICE_CODE_TO_TYPE[policy.service_code];
  if (!serviceType) {
    console.warn(`[trigger-scan] Unknown service_code: ${policy.service_code}`);
    return 0;
  }

  let processed = 0;
  const BATCH = 100;
  let offset = 0;

  // Determine entity source based on trigger type
  const needsCompany = ['COMPANY_YEAR_END', 'VAT_PERIOD_END'].includes(policy.trigger_type);
  const needsClient = ['TAX_YEAR_END', 'MTD_QUARTER_END'].includes(policy.trigger_type);

  while (true) {
    // Fetch entities with active engagements for this service code
    const { data: engagements, error: engErr } = await admin
      .from('client_engagements')
      .select(`
        id, client_id, company_id, organization_id,
        services_catalog!inner(code)
      `)
      .eq('organization_id', orgId)
      .eq('services_catalog.code', policy.service_code)
      .eq('status', 'active')
      .range(offset, offset + BATCH - 1);

    if (engErr) {
      console.error(`[trigger-scan] Engagement fetch error:`, engErr);
      break;
    }
    if (!engagements || engagements.length === 0) break;

    for (const eng of engagements) {
      try {
        const entityId = needsCompany ? eng.company_id : eng.client_id;
        const entityType = needsCompany ? 'company' : 'client';

        if (!entityId) continue;

        // Compute period_end based on trigger type
        const periodResult = await computePeriodEnd(
          admin, policy.trigger_type, entityId, entityType, today
        );
        if (!periodResult.periodEnd) continue;

        const periodEnd = periodResult.periodEnd;
        const periodStart = periodResult.periodStart;

        // Check if trigger has fired (period_end + offset <= today)
        const triggerDate = new Date(periodEnd);
        const effectiveStart = new Date(triggerDate);
        effectiveStart.setDate(effectiveStart.getDate() + (policy.trigger_offset_days || 0));
        if (effectiveStart > today) continue;

        // Idempotent: check if we already have a job for this period
        const { data: existing } = await admin
          .from('chaser_job_periods')
          .select('job_id')
          .eq('organization_id', orgId)
          .eq('service_code', policy.service_code)
          .eq('entity_id', entityId)
          .eq('period_end', periodEnd)
          .maybeSingle();

        let jobId: string;

        if (existing?.job_id) {
          jobId = existing.job_id;
        } else {
          // Create or find the job
          jobId = await ensureJobExists(
            admin, orgId, entityType, entityId,
            eng.client_id, eng.company_id,
            serviceType, policy.service_code,
            periodStart, periodEnd
          );
        }

        // Ensure chaser run exists for this job+policy
        await ensureChaserRun(admin, orgId, jobId, policy, triggerDate, periodStart, periodEnd);
        processed++;
      } catch (entErr) {
        console.error(`[trigger-scan] Entity error:`, entErr);
      }
    }

    if (engagements.length < BATCH) break;
    offset += BATCH;
  }

  // Also handle JOB_CREATED policies: find jobs without chaser runs
  if (policy.trigger_type === 'JOB_CREATED') {
    processed += await processJobCreatedPolicy(admin, orgId, policy, serviceType);
  }

  return processed;
}

// ---------------------------------------------------------------------------
// Period End Computation
// ---------------------------------------------------------------------------

async function computePeriodEnd(
  admin: ReturnType<typeof createClient>,
  triggerType: string,
  entityId: string,
  entityType: string,
  today: Date
): Promise<{ periodEnd: string | null; periodStart: string | null }> {
  switch (triggerType) {
    case 'COMPANY_YEAR_END': {
      const { data: company } = await admin
        .from('companies')
        .select('year_end_month, year_end_day')
        .eq('id', entityId)
        .single();
      if (!company?.year_end_month || !company?.year_end_day) return { periodEnd: null, periodStart: null };
      const m = company.year_end_month - 1;
      const d = company.year_end_day;
      let ye = new Date(today.getFullYear(), m, d);
      if (ye > today) ye = new Date(today.getFullYear() - 1, m, d);
      const ps = new Date(ye);
      ps.setFullYear(ps.getFullYear() - 1);
      ps.setDate(ps.getDate() + 1);
      return {
        periodEnd: ye.toISOString().split('T')[0],
        periodStart: ps.toISOString().split('T')[0],
      };
    }
    case 'TAX_YEAR_END': {
      const apr5 = new Date(today.getFullYear(), 3, 5);
      let ye = apr5;
      if (today < apr5) ye = new Date(today.getFullYear() - 1, 3, 5);
      const ps = new Date(ye.getFullYear() - 1, 3, 6);
      return {
        periodEnd: ye.toISOString().split('T')[0],
        periodStart: ps.toISOString().split('T')[0],
      };
    }
    case 'MTD_QUARTER_END': {
      // Standard quarters: Jan 5, Apr 5, Jul 5, Oct 5
      const quarters = [
        { m: 0, d: 5 }, { m: 3, d: 5 }, { m: 6, d: 5 }, { m: 9, d: 5 },
      ];
      let best: Date | null = null;
      for (const q of quarters) {
        const qd = new Date(today.getFullYear(), q.m, q.d);
        if (qd <= today) best = qd;
      }
      if (!best) best = new Date(today.getFullYear() - 1, 9, 5);
      // Quarter start = 3 months before + 1 day
      const qs = new Date(best);
      qs.setMonth(qs.getMonth() - 3);
      qs.setDate(qs.getDate() + 1);
      return {
        periodEnd: best.toISOString().split('T')[0],
        periodStart: qs.toISOString().split('T')[0],
      };
    }
    case 'VAT_PERIOD_END': {
      const { data: company } = await admin
        .from('companies')
        .select('vat_frequency, vat_stagger_group')
        .eq('id', entityId)
        .single();
      if (!company?.vat_frequency) return { periodEnd: null, periodStart: null };
      // Quarterly VAT with stagger groups
      const stagger = parseInt(company.vat_stagger_group || '1', 10);
      // Stagger 1: Mar/Jun/Sep/Dec, Stagger 2: Jan/Apr/Jul/Oct, Stagger 3: Feb/May/Aug/Nov
      const staggerMonths: Record<number, number[]> = {
        1: [2, 5, 8, 11], // Mar, Jun, Sep, Dec (0-indexed)
        2: [0, 3, 6, 9],  // Jan, Apr, Jul, Oct
        3: [1, 4, 7, 10], // Feb, May, Aug, Nov
      };
      const months = staggerMonths[stagger] || staggerMonths[1];
      let bestEnd: Date | null = null;
      for (const m of months) {
        // Last day of the month
        const lastDay = new Date(today.getFullYear(), m + 1, 0);
        if (lastDay <= today) {
          if (!bestEnd || lastDay > bestEnd) bestEnd = lastDay;
        }
      }
      if (!bestEnd) {
        // Try last year
        for (const m of months) {
          const lastDay = new Date(today.getFullYear() - 1, m + 1, 0);
          if (!bestEnd || lastDay > bestEnd) bestEnd = lastDay;
        }
      }
      if (!bestEnd) return { periodEnd: null, periodStart: null };
      const ps = new Date(bestEnd);
      ps.setMonth(ps.getMonth() - 2);
      ps.setDate(1);
      return {
        periodEnd: bestEnd.toISOString().split('T')[0],
        periodStart: ps.toISOString().split('T')[0],
      };
    }
    default:
      return { periodEnd: null, periodStart: null };
  }
}

// ---------------------------------------------------------------------------
// Idempotent Job Creation
// ---------------------------------------------------------------------------

async function ensureJobExists(
  admin: ReturnType<typeof createClient>,
  orgId: string,
  entityType: string,
  entityId: string,
  clientId: string | null,
  companyId: string | null,
  serviceType: string,
  serviceCode: string,
  periodStart: string | null,
  periodEnd: string
): Promise<string> {
  // First check if job already exists for this period
  let query = admin.from('jobs')
    .select('id')
    .eq('organization_id', orgId)
    .eq('service_type', serviceType)
    .eq('period_end', periodEnd);

  if (companyId) query = query.eq('company_id', companyId);
  else if (clientId) query = query.eq('client_id', clientId);

  const { data: existingJob } = await query.maybeSingle();
  
  if (existingJob) {
    // Record in chaser_job_periods for tracking
    await admin.from('chaser_job_periods').upsert({
      organization_id: orgId,
      service_code: serviceCode,
      entity_type: entityType,
      entity_id: entityId,
      period_end: periodEnd,
      job_id: existingJob.id,
    }, { onConflict: 'organization_id,service_code,entity_id,period_end' });
    return existingJob.id;
  }

  // Create new job
  const jobName = `${serviceCode} - ${periodEnd}`;
  const { data: newJob, error: createErr } = await admin.from('jobs').insert({
    organization_id: orgId,
    client_id: clientId,
    company_id: companyId,
    service_type: serviceType,
    job_name: jobName,
    status: 'blank',
    period_start: periodStart,
    period_end: periodEnd,
  }).select('id').single();

  if (createErr) {
    throw new Error(`Failed to create job: ${createErr.message}`);
  }

  // Record in tracking table
  await admin.from('chaser_job_periods').upsert({
    organization_id: orgId,
    service_code: serviceCode,
    entity_type: entityType,
    entity_id: entityId,
    period_end: periodEnd,
    job_id: newJob.id,
  }, { onConflict: 'organization_id,service_code,entity_id,period_end' });

  return newJob.id;
}

// ---------------------------------------------------------------------------
// Ensure Chaser Run
// ---------------------------------------------------------------------------

async function ensureChaserRun(
  admin: ReturnType<typeof createClient>,
  orgId: string,
  jobId: string,
  policy: any,
  triggerDate: Date,
  periodStart: string | null,
  periodEnd: string | null
): Promise<void> {
  const firstSendAt = new Date(triggerDate);
  firstSendAt.setDate(firstSendAt.getDate() + (policy.trigger_offset_days || 0));

  // If first send is in the past, start from now
  const now = new Date();
  const nextSend = firstSendAt < now ? now : firstSendAt;

  await admin.from('automation_chaser_runs').upsert({
    organization_id: orgId,
    job_id: jobId,
    policy_id: policy.id,
    status: 'ACTIVE',
    trigger_date: triggerDate.toISOString(),
    period_start: periodStart,
    period_end: periodEnd,
    next_send_at: nextSend.toISOString(),
    frequency_unit: policy.frequency_unit,
    frequency_interval: policy.frequency_interval,
    email_template_id: policy.email_template_id,
    stop_condition_value: policy.stop_condition_value,
  }, { onConflict: 'job_id,policy_id', ignoreDuplicates: true });
}

// ---------------------------------------------------------------------------
// JOB_CREATED Policy Processing
// ---------------------------------------------------------------------------

async function processJobCreatedPolicy(
  admin: ReturnType<typeof createClient>,
  orgId: string,
  policy: any,
  serviceType: string
): Promise<number> {
  // Find jobs of this service type that don't have a chaser run for this policy
  const { data: jobs } = await admin
    .from('jobs')
    .select('id, created_at, period_start, period_end, client_id, company_id')
    .eq('organization_id', orgId)
    .eq('service_type', serviceType)
    .neq('status', 'completed')
    .neq('status', 'records_received')
    .limit(100);

  if (!jobs || jobs.length === 0) return 0;

  let count = 0;
  for (const job of jobs) {
    // Check if run already exists
    const { data: existingRun } = await admin
      .from('automation_chaser_runs')
      .select('id')
      .eq('job_id', job.id)
      .eq('policy_id', policy.id)
      .maybeSingle();

    if (existingRun) continue;

    const triggerDate = new Date(job.created_at);
    await ensureChaserRun(admin, orgId, job.id, policy, triggerDate, job.period_start, job.period_end);
    count++;
  }
  return count;
}
