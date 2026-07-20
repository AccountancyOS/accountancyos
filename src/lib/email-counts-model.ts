/**
 * Pure derivation of the /emails tab-badge counts. Extracted so the counts cannot silently be tied
 * back to the status-filtered table list (the bug this fixes): the badges must reflect the whole
 * non-sent queue regardless of which tab is active, so they are computed from a separate, unfiltered
 * (id, status) query.
 */

export interface EmailStatusRow {
  status: string;
}

export interface EmailCounts {
  /** Every non-sent row (the counts query already excludes 'sent'), incl. cancelled/ignored. */
  all: number;
  draft: number;
  /** The 'queued' tab is status IN (queued, pending); the badge folds them together to match. */
  queued: number;
  failed: number;
}

export function deriveEmailCounts(rows: EmailStatusRow[] | null | undefined): EmailCounts {
  const list = rows ?? [];
  return {
    all: list.length,
    draft: list.filter((r) => r.status === "draft").length,
    queued: list.filter((r) => r.status === "queued" || r.status === "pending").length,
    failed: list.filter((r) => r.status === "failed").length,
  };
}
