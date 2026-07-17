/**
 * AUTO-1 — pure mirror of the automation engines' safety rules (no DB import). Enforcement lives in
 * the edge functions (workflow-tick, process-automation-events); this documents/tests the rules.
 */

/**
 * How long a claim is honoured before another run may take the item over. A run that crashes
 * mid-step leaves claimed_at set forever; without a reclaim window that instance would be stranded.
 * 10 minutes matches the email-queue worker (Fix 10, 20260706144830) — one reclaim idiom, not two.
 */
export const STALE_CLAIM_MINUTES = 10;

/**
 * Whether the org-level automation kill-switch should stop work for this org.
 *
 * Semantics deliberately match the router's existing check
 * (`data?.automations_enabled !== false` in process-automation-events): a missing row or NULL means
 * ENABLED, only an explicit false disables. The executor previously had no kill-switch check at
 * all, so a disabled org still had its workflow steps advanced — emails sent, jobs assigned,
 * statuses changed. If the two engines disagreed about the same org, the switch would be
 * meaningless.
 */
export function automationKillSwitchBlocks(
  automationsEnabled: boolean | null | undefined,
): boolean {
  return automationsEnabled === false;
}

/** ISO timestamp before which an existing claim is considered stale and may be taken over. */
export function staleClaimCutoff(now: Date): string {
  return new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000).toISOString();
}

/**
 * How many times the router may attempt an event before it is dead-lettered. The router used to
 * leave a failing event's processed_at NULL, so it was re-selected and retried on EVERY run
 * forever, with no bound and no visibility. After this many failed attempts the event is stamped
 * failed_at (a visible dead-letter) and excluded from selection instead of retried indefinitely.
 */
export const MAX_EVENT_ATTEMPTS = 5;

/**
 * Given the attempt count AFTER incrementing for the current failure, whether the event should be
 * dead-lettered (stamped failed_at) rather than left for another attempt.
 */
export function eventShouldDeadLetter(attemptsAfterThisFailure: number): boolean {
  return attemptsAfterThisFailure >= MAX_EVENT_ATTEMPTS;
}

/**
 * Per-engine global kill-switch (increment 3). Independent of the per-ORG automations_enabled: this
 * stops an entire engine across all orgs, e.g. to halt the executor during an incident without
 * touching the router.
 *
 * Semantics are FAIL-CLOSED and the OPPOSITE of the per-org switch: the engine runs only when a
 * switch row explicitly says enabled=true. A missing row, NULL, or a lookup the function could not
 * resolve means DO NOT RUN. The switches table is seeded disabled, so applying the cron migration
 * is inert until each engine is deliberately turned on — a wrong/absent value must never silently
 * activate customer-facing automation.
 */
export function engineDisabled(enabled: boolean | null | undefined): boolean {
  return enabled !== true;
}
