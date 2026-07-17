import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  automationKillSwitchBlocks,
  staleClaimCutoff,
  STALE_CLAIM_MINUTES,
  eventShouldDeadLetter,
  MAX_EVENT_ATTEMPTS,
} from "@/lib/automation-engine-model";

/**
 * AUTO-1 increment 1: workflow-tick advanced workflow instances — sending client emails, assigning
 * jobs, changing statuses — with NO kill-switch check and NO claiming. These pin the two rules the
 * hardened executor must follow. Enforcement lives in the edge function; this is the pure mirror.
 */

describe("automationKillSwitchBlocks", () => {
  it("blocks when the org has automations explicitly disabled", () => {
    expect(automationKillSwitchBlocks(false)).toBe(true);
  });

  it("does not block when explicitly enabled", () => {
    expect(automationKillSwitchBlocks(true)).toBe(false);
  });

  it.each([null, undefined])(
    "defaults to enabled when the setting is %s, matching the router's existing semantics",
    (value) => {
      // process-automation-events uses `data?.automations_enabled !== false` — a missing row means
      // enabled. The executor must agree, or the two engines would disagree about the same org.
      expect(automationKillSwitchBlocks(value)).toBe(false);
    },
  );
});

describe("staleClaimCutoff", () => {
  it("is STALE_CLAIM_MINUTES before now", () => {
    const now = new Date("2026-07-17T12:00:00.000Z");

    expect(staleClaimCutoff(now)).toBe("2026-07-17T11:50:00.000Z");
    expect(STALE_CLAIM_MINUTES).toBe(10);
  });

  it("lets a crashed run's claim be reclaimed, but not a live one", () => {
    const now = new Date("2026-07-17T12:00:00.000Z");
    const cutoff = staleClaimCutoff(now);

    // A claim from a run that died 30 minutes ago is reclaimable...
    expect("2026-07-17T11:30:00.000Z" < cutoff).toBe(true);
    // ...but a claim from a run still in flight 2 minutes ago is not.
    expect("2026-07-17T11:58:00.000Z" < cutoff).toBe(false);
  });
});

describe("eventShouldDeadLetter (router, AUTO-1 inc 2)", () => {
  it("does not dead-letter while attempts remain", () => {
    expect(eventShouldDeadLetter(1)).toBe(false);
    expect(eventShouldDeadLetter(MAX_EVENT_ATTEMPTS - 1)).toBe(false);
  });

  it("dead-letters once attempts reach the cap", () => {
    expect(eventShouldDeadLetter(MAX_EVENT_ATTEMPTS)).toBe(true);
    expect(eventShouldDeadLetter(MAX_EVENT_ATTEMPTS + 1)).toBe(true);
  });

  it("caps at 5 — a poisoned event is not retried forever", () => {
    expect(MAX_EVENT_ATTEMPTS).toBe(5);
  });
});

/**
 * No Deno test harness in this repo, so these are source-structure assertions against the actual
 * edge function — same convention as hmrc-vat-submit-token.test.ts. They pin the control-flow
 * guarantees that must hold BEFORE this function is ever put on a cron.
 */
export function workflowTickFindings(src: string) {
  const killIdx = src.indexOf("automationsDisabledForOrg(supabase, instance.org_id)");
  const claimIdx = src.indexOf('.update({ claimed_at: new Date().toISOString() })');
  return {
    /** The router spawns 'queued'; selecting only 'running' matched nothing it ever created. */
    selectsQueuedAndRunning: /\.in\("status",\s*\["queued",\s*"running"\]\)/.test(src),
    staleOnlyRunningSelect: /\.eq\("status",\s*"running"\)\s*\n\s*\.lte\("next_run_at"/.test(src),
    /** Must not execute steps for an org with automations switched off. */
    checksKillSwitch: killIdx !== -1,
    /** Kill-switch must be checked BEFORE claiming: a disabled org's rows stay untouched. */
    killSwitchBeforeClaim: killIdx !== -1 && claimIdx !== -1 && killIdx < claimIdx,
    /** Two overlapping runs must not execute the same step twice. */
    claimsAtomically: claimIdx !== -1,
    releasesClaim: /\.update\(\{ claimed_at: null \}\)/.test(src),
    /** Resume mode used to be unbounded. */
    resumeBounded: /\.eq\("waiting_for_event_key", eventKey\)[\s\S]{0,400}?\.limit\(limit\)/.test(src),
    /** Structured counts, not just a processed/advanced pair. */
    structuredLog: /skipped_kill_switch/.test(src) && /scanned/.test(src),
  };
}

export function routerFindings(src: string) {
  const claimIdx = src.indexOf('.update({ claimed_at: new Date().toISOString() })');
  const routeIdx = src.indexOf("routeTriggerContractEvent(supabase, typedEvent)");
  return {
    /** Selection must skip claimed events and exclude dead-lettered ones. */
    selectExcludesClaimedAndFailed:
      /claimed_at\.is\.null,claimed_at\.lt\./.test(src) && /\.is\("failed_at", null\)/.test(src),
    /** Must claim an event atomically before routing/executing it. */
    claimsAtomically: claimIdx !== -1,
    /** Claim must happen before the trigger-contract router spawns workflows. */
    claimBeforeRoute: claimIdx !== -1 && routeIdx !== -1 && claimIdx < routeIdx,
    /** A failing event must reach a visible dead-letter, not retry forever. */
    deadLetters: /failed_at:/.test(src) && /eventShouldDeadLetter\(/.test(src),
    tracksAttempts: /attempts/.test(src) && /last_error/.test(src),
    /** The old behaviour: catch pushed to allErrors and left processed_at NULL. */
    structuredLog: /dead_lettered/.test(src) && /scanned/.test(src),
  };
}

describe("process-automation-events hardening (AUTO-1 increment 2)", () => {
  const f = routerFindings(
    readFileSync(
      resolve(process.cwd(), "supabase/functions/process-automation-events/index.ts"),
      "utf8",
    ),
  );

  it("selection skips claimed events and excludes dead-lettered ones", () => {
    expect(f.selectExcludesClaimedAndFailed).toBe(true);
  });

  it("claims an event atomically before routing it", () => {
    expect(f.claimsAtomically).toBe(true);
    expect(f.claimBeforeRoute).toBe(true);
  });

  it("dead-letters a repeatedly-failing event instead of retrying forever", () => {
    expect(f.deadLetters).toBe(true);
    expect(f.tracksAttempts).toBe(true);
  });

  it("emits structured counters", () => {
    expect(f.structuredLog).toBe(true);
  });
});

describe("workflow-tick hardening (AUTO-1 increment 1)", () => {
  const f = workflowTickFindings(
    readFileSync(resolve(process.cwd(), "supabase/functions/workflow-tick/index.ts"), "utf8"),
  );

  it("advances instances the router actually spawns ('queued'), not just 'running'", () => {
    expect(f.selectsQueuedAndRunning).toBe(true);
    expect(f.staleOnlyRunningSelect).toBe(false);
  });

  it("honours the org kill-switch", () => {
    expect(f.checksKillSwitch).toBe(true);
  });

  it("checks the kill-switch before claiming, so a disabled org's rows are untouched", () => {
    expect(f.killSwitchBeforeClaim).toBe(true);
  });

  it("claims atomically and releases the claim", () => {
    expect(f.claimsAtomically).toBe(true);
    expect(f.releasesClaim).toBe(true);
  });

  it("bounds resume mode", () => {
    expect(f.resumeBounded).toBe(true);
  });

  it("emits structured counters", () => {
    expect(f.structuredLog).toBe(true);
  });
});
