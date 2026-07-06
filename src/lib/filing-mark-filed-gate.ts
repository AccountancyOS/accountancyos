/**
 * FIL-2 / Fix 6: decide whether a filing may be flipped to `filed`.
 *
 * A filing may be marked filed only if it has EITHER already been submitted through a real
 * transport (status submitted/accepted), OR an explicit filing reference is supplied (the
 * reference from wherever it was actually filed — e.g. directly on the HMRC/Companies House
 * portal). This blocks a silent status flip with an empty/fabricated reference masquerading as
 * a completed filing.
 *
 * Pure + isolated (no supabase import) so the rule is unit-tested directly.
 *
 * NOTE: the full structural gate (require an approved model snapshot) is intentionally NOT
 * enforced here — that infrastructure is not yet wired (createFilingApproval has no callers and
 * model_snapshot_id is unpopulated), so requiring it now would block all filing. Tracked as the
 * deferred half of FIL-1.
 */
export function evaluateMarkFiled(
  currentStatus: string,
  filingReference?: string
): { allowed: boolean; error?: string; reference: string; isManual: boolean } {
  const alreadySubmitted = currentStatus === "submitted" || currentStatus === "accepted";
  const trimmed = (filingReference ?? "").trim();
  if (!alreadySubmitted && !trimmed) {
    return {
      allowed: false,
      error:
        "A filing reference is required to mark this as filed. Submit it to HMRC/Companies House first, or enter the reference from where it was filed.",
      reference: "",
      isManual: true,
    };
  }
  return { allowed: true, reference: trimmed, isManual: !alreadySubmitted };
}
