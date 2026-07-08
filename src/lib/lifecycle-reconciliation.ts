/**
 * Fix 8 · Increment 1 — client-side consumer for the read-only lifecycle reconciliation report
 * RPC (public.lifecycle_reconciliation_report). Pure summarisation so later increments (and any
 * admin UI) can decide, from a report, whether the org is clean and whether it is safe to apply
 * the stricter uniqueness indexes of Increment 8.5.
 */

export interface LifecycleReconciliationReport {
  success: boolean;
  error?: string;
  organization_id?: string;
  jobs_total?: number;
  setup_pending_jobs?: number;
  null_period_label_jobs?: number;
  both_entity_jobs?: number;
  duplicate_job_groups?: number;
  duplicate_job_excess_rows?: number;
  null_label_duplicate_groups?: number;
  active_client_links?: number;
  backstop_indexes_present?: string[];
  backstop_indexes_missing?: string[];
}

export interface ReconciliationSummary {
  clean: boolean;
  /** True when applying stricter uniqueness indexes would FAIL on existing duplicate data. */
  blocksIndexTightening: boolean;
  issues: string[];
}

const n = (v: number | undefined) => v ?? 0;

export function summarizeReconciliation(r: LifecycleReconciliationReport): ReconciliationSummary {
  if (!r.success) {
    return { clean: false, blocksIndexTightening: true, issues: [r.error || "Report failed"] };
  }

  const issues: string[] = [];
  if (n(r.duplicate_job_groups) > 0) {
    issues.push(
      `${r.duplicate_job_groups} duplicate job group(s) (${n(r.duplicate_job_excess_rows)} excess rows)`,
    );
  }
  if (n(r.setup_pending_jobs) > 0) issues.push(`${r.setup_pending_jobs} 'Setup Pending' job(s)`);
  if (n(r.null_period_label_jobs) > 0) issues.push(`${r.null_period_label_jobs} job(s) with no period label`);
  if (n(r.both_entity_jobs) > 0) issues.push(`${r.both_entity_jobs} job(s) with both client and company set`);
  if (n(r.null_label_duplicate_groups) > 0) {
    issues.push(`${r.null_label_duplicate_groups} null-label duplicate group(s)`);
  }
  if ((r.backstop_indexes_missing?.length ?? 0) > 0) {
    issues.push(`missing backstop indexes: ${r.backstop_indexes_missing!.join(", ")}`);
  }

  // Tightening the jobs indexes to NULLS-NOT-DISTINCT (Inc 8.5) fails if duplicate groups exist.
  const blocksIndexTightening =
    n(r.duplicate_job_groups) > 0 || n(r.null_label_duplicate_groups) > 0;

  // "clean" = no duplicate/inconsistent job data (missing indexes are a separate concern).
  const clean =
    n(r.duplicate_job_groups) === 0 &&
    n(r.setup_pending_jobs) === 0 &&
    n(r.null_period_label_jobs) === 0 &&
    n(r.both_entity_jobs) === 0 &&
    n(r.null_label_duplicate_groups) === 0;

  return { clean, blocksIndexTightening, issues };
}
