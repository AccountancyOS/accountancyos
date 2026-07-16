/**
 * Pure FX helpers (no supabase import) so the rate-safety contract is unit-testable.
 * See fx-service.ts (getFXRate) and JournalEditor for the consumers.
 */

/** A rate is usable only if it is a finite, strictly-positive number. */
export function isUsableRate(rate: unknown): boolean {
  const n = Number(rate);
  return Number.isFinite(n) && n > 0;
}

/**
 * Whether a journal must be blocked from posting because its FX rate is unsafe.
 * A foreign-currency (non-GBP) journal whose rate came back as the 'fallback' sentinel has no
 * real rate and would silently post at parity — block it until a rate is supplied.
 */
export function fxRateBlocksPosting(params: { currency: string; source: string }): boolean {
  return params.currency !== "GBP" && params.source === "fallback";
}
