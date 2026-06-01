/**
 * Chaser Policy Service
 * Domain logic for the event-driven reminder (chaser) system.
 * Handles trigger date resolution, idempotent job creation, run management,
 * and stop-condition enforcement.
 */

import { supabase } from "@/integrations/supabase/client";
import { addDays, addWeeks, addMonths } from "date-fns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TriggerType =
  | "COMPANY_YEAR_END"
  | "TAX_YEAR_END"
  | "MTD_QUARTER_END"
  | "VAT_PERIOD_END"
  | "MANUAL"
  | "JOB_CREATED";

export type FrequencyUnit = "DAY" | "WEEK" | "MONTH";
export type ChaserRunStatus = "ACTIVE" | "STOPPED" | "PAUSED";

export interface ChaserPolicy {
  id: string;
  organization_id: string;
  service_code: string;
  name: string;
  description: string;
  trigger_type: TriggerType;
  trigger_offset_days: number;
  frequency_unit: FrequencyUnit;
  frequency_interval: number;
  min_frequency_interval: number;
  max_frequency_interval: number;
  email_template_id: string | null;
  stop_condition_type: string;
  stop_condition_value: string;
  is_enabled: boolean;
}

export interface TriggerDateResult {
  triggerDate: Date | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// Trigger Date Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the trigger date for a chaser policy given context about the
 * company and/or job.
 */
export function resolveTriggerDate(
  triggerType: TriggerType,
  job?: { period_start?: string | null; period_end?: string | null; created_at?: string } | null,
  company?: { year_end_month?: number | null; year_end_day?: number | null; vat_frequency?: string | null; vat_stagger_group?: string | null } | null
): TriggerDateResult {
  switch (triggerType) {
    case "COMPANY_YEAR_END":
      return resolveCompanyYearEnd(job, company);
    case "TAX_YEAR_END":
      return resolveTaxYearEnd(job);
    case "MTD_QUARTER_END":
      return resolveMtdQuarterEnd(job);
    case "VAT_PERIOD_END":
      return resolveVatPeriodEnd(job, company);
    case "JOB_CREATED":
      if (!job?.created_at) return { triggerDate: null, error: "Job not yet created" };
      return { triggerDate: new Date(job.created_at) };
    case "MANUAL":
      return { triggerDate: null }; // Set manually by accountant
    default:
      return { triggerDate: null, error: `Unknown trigger type: ${triggerType}` };
  }
}

function resolveCompanyYearEnd(
  job?: { period_end?: string | null } | null,
  company?: { year_end_month?: number | null; year_end_day?: number | null } | null
): TriggerDateResult {
  // Prefer job period_end if available
  if (job?.period_end) {
    return { triggerDate: new Date(job.period_end) };
  }
  // Compute from company year-end fields
  if (!company?.year_end_month || !company?.year_end_day) {
    return { triggerDate: null, error: "Cannot start chaser — company year end date is not set" };
  }
  const today = new Date();
  const m = company.year_end_month - 1; // 0-indexed
  const d = company.year_end_day;
  // Build YE for current year; if it's in the future, use last year's
  let ye = new Date(today.getFullYear(), m, d);
  if (ye > today) {
    ye = new Date(today.getFullYear() - 1, m, d);
  }
  return { triggerDate: ye };
}

function resolveTaxYearEnd(
  job?: { period_end?: string | null } | null
): TriggerDateResult {
  if (job?.period_end) {
    return { triggerDate: new Date(job.period_end) };
  }
  // Default: most recent 5 April
  const today = new Date();
  const currentYearApril5 = new Date(today.getFullYear(), 3, 5); // April = month 3
  if (today >= currentYearApril5) {
    return { triggerDate: currentYearApril5 };
  }
  return { triggerDate: new Date(today.getFullYear() - 1, 3, 5) };
}

function resolveMtdQuarterEnd(
  job?: { period_end?: string | null } | null
): TriggerDateResult {
  if (job?.period_end) {
    return { triggerDate: new Date(job.period_end) };
  }
  // Standard quarters: Apr 5, Jul 5, Oct 5, Jan 5
  const today = new Date();
  const quarters = [
    new Date(today.getFullYear(), 0, 5),  // Jan 5
    new Date(today.getFullYear(), 3, 5),  // Apr 5
    new Date(today.getFullYear(), 6, 5),  // Jul 5
    new Date(today.getFullYear(), 9, 5),  // Oct 5
  ];
  // Find most recent quarter end <= today
  let best: Date | null = null;
  for (const q of quarters) {
    if (q <= today) best = q;
  }
  if (!best) {
    best = new Date(today.getFullYear() - 1, 9, 5); // Oct 5 last year
  }
  return { triggerDate: best };
}

function resolveVatPeriodEnd(
  job?: { period_end?: string | null } | null,
  company?: { vat_frequency?: string | null; vat_stagger_group?: string | null } | null
): TriggerDateResult {
  if (job?.period_end) {
    return { triggerDate: new Date(job.period_end) };
  }
  if (!company?.vat_frequency) {
    return { triggerDate: null, error: "Cannot start chaser — VAT frequency is not set on company" };
  }
  // Cannot reliably compute without a job period; return error
  return { triggerDate: null, error: "Cannot start chaser — no VAT period end date available. Create the VAT job first." };
}

// ---------------------------------------------------------------------------
// Next Send Computation
// ---------------------------------------------------------------------------

export function computeNextSendAt(
  fromDate: Date,
  frequencyUnit: FrequencyUnit,
  frequencyInterval: number
): Date {
  switch (frequencyUnit) {
    case "DAY":
      return addDays(fromDate, frequencyInterval);
    case "WEEK":
      return addWeeks(fromDate, frequencyInterval);
    case "MONTH":
      return addMonths(fromDate, frequencyInterval);
    default:
      return addMonths(fromDate, 1);
  }
}

// ---------------------------------------------------------------------------
// Chaser Run Management (client-side, for UI interactions)
// ---------------------------------------------------------------------------

/**
 * Start a chaser run for a specific job + policy.
 * For MANUAL trigger policies, triggerDate must be supplied.
 */
export async function startChaserRun(
  jobId: string,
  policyId: string,
  organizationId: string,
  options: {
    triggerDate: Date;
    periodStart?: string | null;
    periodEnd?: string | null;
    frequencyUnit: FrequencyUnit;
    frequencyInterval: number;
    emailTemplateId: string | null;
    stopConditionValue: string;
    triggerOffsetDays: number;
  }
): Promise<{ success: boolean; error?: string; runId?: string }> {
  const firstSendAt = addDays(options.triggerDate, options.triggerOffsetDays);

  const { data, error } = await supabase
    .from("automation_chaser_runs")
    .upsert(
      {
        organization_id: organizationId,
        job_id: jobId,
        policy_id: policyId,
        status: "ACTIVE",
        trigger_date: options.triggerDate.toISOString(),
        period_start: options.periodStart || null,
        period_end: options.periodEnd || null,
        next_send_at: firstSendAt.toISOString(),
        frequency_unit: options.frequencyUnit,
        frequency_interval: options.frequencyInterval,
        email_template_id: options.emailTemplateId,
        stop_condition_value: options.stopConditionValue,
      },
      { onConflict: "job_id,policy_id", ignoreDuplicates: true }
    )
    .select("id")
    .single();

  if (error) {
    // Duplicate is acceptable (idempotent)
    if (error.code === "23505" || error.message?.includes("duplicate")) {
      return { success: true };
    }
    return { success: false, error: error.message };
  }
  return { success: true, runId: data?.id };
}

/**
 * Stop all active chaser runs for a given job.
 * Called when job status reaches the stop condition (e.g. records_received).
 */
export async function stopChaserRunsForJob(jobId: string): Promise<void> {
  // 1. Get all active run IDs
  const { data: runs } = await supabase
    .from("automation_chaser_runs")
    .select("id")
    .eq("job_id", jobId)
    .eq("status", "ACTIVE");

  if (!runs || runs.length === 0) return;

  const runIds = runs.map((r) => r.id);

  // 2. Stop the runs
  await supabase
    .from("automation_chaser_runs")
    .update({ status: "STOPPED", next_send_at: null })
    .in("id", runIds);

  // 3. Cancel queued messages for those runs
  await supabase
    .from("automation_chaser_messages")
    .update({ status: "CANCELLED" })
    .in("chaser_run_id", runIds)
    .eq("status", "QUEUED");
}

/**
 * Pause or resume a chaser run.
 */
export async function toggleChaserRunPause(
  runId: string,
  currentStatus: ChaserRunStatus
): Promise<{ success: boolean; error?: string }> {
  const newStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";

  // If resuming, compute next_send_at from now
  const updates: Record<string, unknown> = { status: newStatus };
  if (newStatus === "ACTIVE") {
    // Fetch run to get frequency
    const { data: run } = await supabase
      .from("automation_chaser_runs")
      .select("frequency_unit, frequency_interval")
      .eq("id", runId)
      .single();

    if (run) {
      const nextSend = computeNextSendAt(
        new Date(),
        run.frequency_unit as FrequencyUnit,
        run.frequency_interval
      );
      updates.next_send_at = nextSend.toISOString();
    }
  }

  const { error } = await supabase
    .from("automation_chaser_runs")
    .update(updates)
    .eq("id", runId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ---------------------------------------------------------------------------
// Trigger Description (for UI display)
// ---------------------------------------------------------------------------

const TRIGGER_DESCRIPTIONS: Record<TriggerType, string> = {
  COMPANY_YEAR_END: "Starts after company accounting year end",
  TAX_YEAR_END: "Starts after the tax year ends (5 April)",
  MTD_QUARTER_END: "Starts after each MTD quarter ends",
  VAT_PERIOD_END: "Starts after each VAT period ends",
  MANUAL: "Started manually by accountant on each job",
  JOB_CREATED: "Starts when a new job is created",
};

// Friendly labels for non-job trigger types used by Slice E/F policies.
const EXTRA_TRIGGER_DESCRIPTIONS: Record<string, string> = {
  LEAD_CREATED: "Starts after a new lead is created",
  LEAD_STAGE_CHANGED: "Starts when a lead changes pipeline stage",
  LEAD_DORMANT: "Starts when a lead has gone quiet",
  QUOTE_SENT: "Starts after a quote is sent to the prospect",
  QUOTE_ACCEPTED: "Starts after a quote is accepted",
  ENGAGEMENT_LETTER_SENT: "Starts after the engagement letter is sent",
  KYC_STATUS_CHANGED: "Starts when a KYC subject is awaiting documents",
  HMRC_AUTH_REQUESTED: "Starts after HMRC authorisation is requested",
  CLIENT_ONBOARDED: "Starts after a client completes onboarding",
  CLIENT_SERVICE_ENABLED: "Starts after a service is activated for a client",
  RECORDS_REQUESTED: "Starts after records are requested from the client",
  QUESTIONNAIRE_SENT: "Starts after a questionnaire is sent to the client",
  QUESTIONNAIRE_SUBMITTED: "Starts after the client submits a questionnaire",
  WORKPAPER_CREATED: "Starts after a workpaper is prepared for review",
  DEADLINE_APPROACHING: "Starts when a deadline is approaching",
  SIGNATURE_REQUESTED: "Starts after a signature is requested",
  INBOUND_MESSAGE_RECEIVED: "Starts after a client message arrives",
  INVOICE_OVERDUE: "Starts when an invoice becomes overdue",
};

function humanizeTriggerKey(key: string): string {
  return key
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function getTriggerDescription(triggerType: TriggerType): string {
  if (TRIGGER_DESCRIPTIONS[triggerType]) return TRIGGER_DESCRIPTIONS[triggerType];
  const extra = EXTRA_TRIGGER_DESCRIPTIONS[triggerType as string];
  if (extra) return extra;
  // Humanise rather than leak the raw machine key.
  return `Starts after ${humanizeTriggerKey(String(triggerType)).toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Category-aware Stop Condition & Category Labels (Settings Centre UI)
// ---------------------------------------------------------------------------

const STOP_CONDITION_LABELS: Record<string, string> = {
  crm_sales: "Stops when the lead replies or changes stage",
  engagement_letters: "Stops when the engagement letter is signed",
  kyc_aml: "Stops when KYC documents are received",
  hmrc_authorisation: "Stops when HMRC authorisation is active",
  onboarding: "Stops when onboarding is complete",
  services: "Stops when the service is acknowledged",
  jobs_records: "Stops when records are received",
  questionnaires: "Stops when the questionnaire is submitted",
  workpapers: "Stops when the workpaper is approved",
  deadlines_payments: "Stops when the deadline is met",
  documents_signatures: "Stops when the document is signed",
  messages_slas: "Stops when a reply is sent",
  billing_revenue: "Stops when the invoice is paid",
};

export function getStopConditionLabel(category: string | null | undefined): string {
  if (!category) return "Stops when the record is complete";
  return STOP_CONDITION_LABELS[category] || "Stops when the record is complete";
}

const CATEGORY_LABELS: Record<string, string> = {
  crm_sales: "CRM & Sales",
  engagement_letters: "Engagement Letters",
  kyc_aml: "KYC & AML",
  hmrc_authorisation: "HMRC Authorisation",
  onboarding: "Onboarding",
  services: "Services",
  jobs_records: "Jobs & Records",
  questionnaires: "Questionnaires",
  workpapers: "Workpapers",
  deadlines_payments: "Deadlines & Payments",
  documents_signatures: "Documents & Signatures",
  messages_slas: "Messages & SLAs",
  billing_revenue: "Billing & Revenue",
  compliance_suppression: "Compliance",
};

export function getCategoryLabel(category: string | null | undefined): string {
  if (!category) return "General";
  return CATEGORY_LABELS[category] || humanizeTriggerKey(category);
}

export function getFrequencyLabel(unit: FrequencyUnit, interval: number): string {
  if (unit === "WEEK" && interval === 1) return "Weekly";
  if (unit === "WEEK" && interval === 2) return "Fortnightly";
  if (unit === "MONTH" && interval === 1) return "Monthly";
  if (unit === "DAY" && interval === 1) return "Daily";
  return `Every ${interval} ${unit.toLowerCase()}${interval > 1 ? "s" : ""}`;
}
