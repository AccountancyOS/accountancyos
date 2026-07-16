/**
 * T1-4 — pure mirror of the duplicate-submission and reconciliation-gate rules in hmrc-vat-submit
 * (no DB import). Enforcement lives in the edge function; this documents/tests the exact rules.
 *
 * Why this exists: the submit function accepts EITHER filingId or snapshotId, and the UI calls it
 * with snapshotId only. The old duplicate pre-check keyed off `filings.idempotency_key` — a
 * different value from the key actually written to filing_submissions — and only ran on the
 * filingId path. So on the path the app uses, nothing detected a double-click before POSTing to
 * HMRC. The key below is the one written to filing_submissions, so the pre-check and the DB's
 * unique index (filing_submissions_idempotency_key_inflight_uniq) agree.
 */

export interface VatSnapshotKeyFields {
  period_start: string;
  period_end: string;
  snapshot_hash: string;
}

export interface VatIdempotencyKey {
  key: string;
  /**
   * True when the key is derived purely from the snapshot, so a repeat attempt for the same
   * approved figures produces the same key and can be detected as a duplicate. False when it falls
   * back to the per-attempt correlation id, which never collides — callers must NOT claim a
   * duplicate check ran in that case.
   */
  deterministic: boolean;
}

/**
 * Format is preserved byte-for-byte from the original inline expression so keys already stored on
 * filing_submissions still match — changing it would silently defeat dedupe against past rows.
 */
export function vatSubmitIdempotencyKey(params: {
  organizationId: string;
  companyId?: string | null;
  snapshot?: VatSnapshotKeyFields | null;
  correlationId: string;
}): VatIdempotencyKey {
  const scope = `${params.organizationId}::HMRC::VAT::${params.companyId || "org"}`;
  const s = params.snapshot;

  if (s) {
    return {
      key: `${scope}::${s.period_start}::${s.period_end}::${s.snapshot_hash}`,
      deterministic: true,
    };
  }

  return { key: `${scope}::${params.correlationId}`, deterministic: false };
}

/**
 * Whether the VAT control-account reconciliation gate must run. `skipReconciliationCheck` arrives
 * in the request body ("for testing only"), so it is advisory: honoured in sandbox for transport
 * testing, always ignored for a real HMRC filing.
 */
export function reconciliationCheckRequired(params: {
  environment: string;
  skipRequested: boolean;
}): boolean {
  if (params.environment === "production") return true;
  return !params.skipRequested;
}
