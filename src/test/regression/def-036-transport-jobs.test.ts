import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DEF-036 — transport_jobs.
 *
 * WHAT THESE TESTS CAN AND CANNOT PROVE. Every assertion here is STATIC, over the migration
 * text. They prove the constraints and grants are declared correctly. They do NOT prove
 * concurrent behaviour: two workers racing for one claim is a property of Postgres executing
 * the statement, and no amount of regex over SQL demonstrates it.
 *
 * The concurrency, lease-expiry and tenant-isolation tests that genuinely exercise those
 * properties require a live database and are specified in
 * docs/runbooks/ct-transport-cutover.md as pre-cutover verification. Saying so here rather
 * than implying these cover it: a test file that looks like it proves concurrency, and does
 * not, is worse than no test file, because it stops anyone writing the real one.
 */
const root = resolve(__dirname, "../../../");
const MIG = readFileSync(
  resolve(root, "supabase/migrations/20260809160000_def_036_transport_jobs.sql"),
  "utf8",
);
const CODE = MIG.replace(/^\s*--.*$/gm, "");

describe("DEF-036 — idempotency cannot be evaded by a NULL", () => {
  it("keys the primary guarantee on the immutable submission version, not the correlation id", () => {
    // THE invariant: at most one transport job per operation per filing submission version.
    // Both columns are NOT NULL, so unlike a correlation-based key there is no NULL through
    // which a duplicate can pass.
    expect(CODE).toMatch(
      /CONSTRAINT transport_jobs_one_per_submission_operation\s+UNIQUE \(filing_submission_id, operation\)/,
    );
  });

  it("carries an internal key that exists before any external call", () => {
    expect(CODE).toMatch(/idempotency_key\s+text NOT NULL/);
    expect(CODE).toMatch(/CONSTRAINT transport_jobs_idempotency_key_uniq UNIQUE \(idempotency_key\)/);
  });

  it("derives that key rather than trusting the caller to supply a deterministic one", () => {
    expect(CODE).toMatch(/transport_jobs_derive_idempotency_key/);
    expect(CODE).toMatch(/NEW\.operation \|\| ':' \|\| NEW\.filing_submission_id/);
    expect(CODE).toMatch(/BEFORE INSERT ON public\.transport_jobs/);
  });

  it("leaves correlation_id nullable, because HMRC does not supply it until acknowledgement", () => {
    // A NOT NULL here would force callers to invent a value before HMRC gives one, which is
    // how a fabricated correlation enters an audit trail.
    expect(CODE).toMatch(/correlation_id\s+text,/);
    expect(CODE).not.toMatch(/correlation_id\s+text NOT NULL/);
  });

  it("enforces the external key only where it exists — a partial index, not a constraint", () => {
    // A plain UNIQUE over a nullable column permits unlimited NULL rows, so it would stop
    // constraining anything in exactly the pre-acknowledgement window that matters most.
    expect(CODE).toMatch(
      /CREATE UNIQUE INDEX transport_jobs_correlation_uniq[\s\S]*?WHERE correlation_id IS NOT NULL/,
    );
  });

  it("asserts all three layers after apply", () => {
    expect(CODE).toMatch(/per-submission idempotency invariant is missing/);
    expect(CODE).toMatch(/internal idempotency key is not unique/);
    expect(CODE).toMatch(/partial correlation index is missing/);
    expect(CODE).toMatch(/correlation_id is NOT NULL\. It does not exist until acknowledgement/);
  });
});

describe("DEF-036 — same-row invariants are declarative", () => {
  it("expresses completion consistency as a CHECK, not a trigger", () => {
    // A CHECK is visible to schema tooling, enforced by every write path including bulk loads,
    // and not disablable per-session.
    expect(CODE).toMatch(/CONSTRAINT transport_jobs_completion_consistent CHECK/);
    expect(CODE).toMatch(/CONSTRAINT transport_jobs_processing_is_claimed CHECK/);
  });

  it("no longer routes those invariants through a trigger workaround", () => {
    expect(CODE).not.toMatch(/transport_jobs_enforce_invariants/);
  });

  it("records who holds a claim, so a stale sweep can tell a crash from slowness", () => {
    expect(CODE).toMatch(/claimed_by\s+text/);
    expect(CODE).toMatch(/claimed_by\s+= COALESCE\(p_worker_id/);
  });
});

describe("DEF-036 — the claim is atomic and bounded", () => {
  it("guards on the from-state, so two workers cannot both claim one job", () => {
    // The existing pollers mark processing with .eq('id') alone; two overlapping cron runs
    // therefore both claim and both call HMRC.
    expect(CODE).toMatch(/WHERE id = p_job_id\s+AND status = 'queued'/);
  });

  it("honours the lease window", () => {
    expect(CODE).toMatch(/claimed_at IS NULL OR claimed_at < p_stale_before/);
  });

  it("enforces max_attempts in the database, not in the worker", () => {
    // A worker that forgets to check still cannot retry forever.
    expect(CODE).toMatch(/attempts >= v_job\.max_attempts/);
    expect(CODE).toMatch(/MAX_ATTEMPTS_EXCEEDED/);
  });

  it("refuses to release a job the caller does not hold", () => {
    expect(CODE).toMatch(/is %, not processing/);
  });

  it("recovers abandoned claims rather than stranding them", () => {
    expect(CODE).toMatch(/recover_stale_transport_jobs/);
    expect(CODE).toMatch(/STALE_CLAIM_RECOVERED/);
    expect(CODE).toMatch(/STALE_CLAIM_EXHAUSTED/);
  });
});

describe("DEF-036 — security and tenancy", () => {
  const definers = [
    "claim_transport_job",
    "release_transport_job",
    "recover_stale_transport_jobs",
    "mcp_transport_job_health",
  ];

  it("pins search_path on every SECURITY DEFINER function", () => {
    for (const fn of definers) {
      const idx = CODE.indexOf(`FUNCTION public.${fn}`);
      expect(idx, `${fn} not found`).toBeGreaterThan(-1);
      const decl = CODE.slice(idx, idx + 900);
      expect(decl, `${fn} does not pin search_path`).toMatch(/SET search_path = public/);
    }
  });

  it("asserts that pinning after apply, not just at authoring time", () => {
    expect(CODE).toMatch(/SECURITY DEFINER function has no pinned search_path/);
  });

  it("revokes from PUBLIC and anon before granting", () => {
    for (const fn of definers) {
      expect(CODE, `${fn} not revoked from PUBLIC/anon`).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}[^;]*FROM PUBLIC, anon`),
      );
    }
  });

  it("grants the worker functions to service_role only", () => {
    for (const fn of ["claim_transport_job", "release_transport_job", "recover_stale_transport_jobs"]) {
      const g = CODE.match(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[^;]*;`));
      expect(g, `${fn} has no grant`).not.toBeNull();
      expect(g![0], `${fn} is granted beyond service_role`).not.toMatch(/authenticated/);
    }
  });

  it("checks worker authority inside the function, not only via the grant", () => {
    // Second gate, in case a grant is ever widened.
    expect(CODE).toMatch(/auth\.role\(\) IS DISTINCT FROM 'service_role'/);
    expect(CODE).toMatch(/insufficient_privilege/);
  });

  it("enables RLS on the table and asserts it after apply", () => {
    expect(CODE).toMatch(/ALTER TABLE public\.transport_jobs ENABLE ROW LEVEL SECURITY/);
    expect(CODE).toMatch(/RLS is not enabled on transport_jobs/);
  });

  it("filters the observability projection by organisation", () => {
    // SECURITY DEFINER bypasses RLS, so the filter must be explicit. Without it the function
    // meant to make the pipeline observable leaks every tenant's queue depth.
    const idx = CODE.indexOf("FUNCTION public.mcp_transport_job_health");
    const body = CODE.slice(idx, CODE.indexOf("$$;", idx));
    expect(body).toMatch(/organization_id IN \(/);
    expect(body).toMatch(/organization_users/);
    expect(body).toMatch(/auth\.uid\(\)/);
  });

  it("exposes counts only — no payload, correlation id, error text or client identifier", () => {
    const idx = CODE.indexOf("FUNCTION public.mcp_transport_job_health");
    const body = CODE.slice(idx, CODE.indexOf("$$;", idx));
    for (const leak of ["correlation_id", "error_message", "metadata", "filing_id", "client_id"]) {
      expect(body, `health projection exposes ${leak}`).not.toContain(leak);
    }
  });

  it("asserts the tenancy filter after apply, so it cannot be quietly removed", () => {
    expect(CODE).toMatch(/mcp_transport_job_health does not filter by organisation/);
    expect(CODE).toMatch(/mcp_transport_job_health exposes correlation ids/);
  });
});

describe("DEF-036 — honest about its own scope", () => {
  it("does not describe itself as purely additive, because it replaces a constraint", () => {
    expect(CODE).toMatch(/DROP CONSTRAINT IF EXISTS filing_artefacts_artefact_type_check/);
    expect(MIG).not.toMatch(/PURELY ADDITIVE/);
    expect(MIG).toMatch(/NOT ADDITIVE, AND NOT RELEASABLE ALONE/);
  });

  it("states it must not be applied alone", () => {
    expect(MIG).toMatch(/MUST NOT be applied on its own/);
  });

  it("drops the predecessor artefact constraint in the same migration", () => {
    // The DEF-034 discipline: both live contradictions this programme repaired came from
    // adding a vocabulary and leaving its predecessor in place.
    const drop = CODE.indexOf("DROP CONSTRAINT IF EXISTS filing_artefacts_artefact_type_check");
    const add = CODE.indexOf("ADD CONSTRAINT filing_artefacts_artefact_type_check");
    expect(drop).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(drop);
    expect(CODE).toMatch(/governed by more than one CHECK — the DEF-034 failure mode/);
  });

  it("leaves filing_queue's submission guarantee intact", () => {
    expect(CODE).toMatch(/filing_queue\.snapshot_hash became nullable/);
    expect(CODE).not.toMatch(/ALTER TABLE public\.filing_queue/);
  });

  it("is exactly one transaction", () => {
    expect(MIG.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(MIG.match(/^COMMIT;$/gm)).toHaveLength(1);
  });
});

describe("DEF-036 — the cutover runbook exists and gates on evidence", () => {
  const RUNBOOK = readFileSync(
    resolve(root, "docs/runbooks/ct-transport-cutover.md"),
    "utf8",
  );

  it("does not assume filing_queue is empty", () => {
    expect(RUNBOOK).toMatch(/must be verified, not\s*\nbelieved/);
    expect(RUNBOOK).toMatch(/recoverable_unstarted/);
    expect(RUNBOOK).toMatch(/ambiguous_stranded/);
    expect(RUNBOOK).toMatch(/obsolete_terminal/);
  });

  it("never discards historical queue records", () => {
    expect(RUNBOOK).toMatch(/No historical queue record is discarded/);
    expect(RUNBOOK).toMatch(/not truncated, not\s*\narchived away and not dropped/);
  });

  it("treats cron authentication as a release gate", () => {
    expect(RUNBOOK).toMatch(/the CT recovery is not\s*\nreleasable/);
    expect(RUNBOOK).toMatch(/canary must complete/);
  });

  it("distinguishes the four causes of zero processed items", () => {
    expect(RUNBOOK).toMatch(/Invocation failure/);
    expect(RUNBOOK).toMatch(/Authentication failure/);
    expect(RUNBOOK).toMatch(/worker logic broken/);
    expect(RUNBOOK).toMatch(/queue genuinely empty/);
  });

  it("documents secret names without exposing material", () => {
    expect(RUNBOOK).toMatch(/never printing|never appears in a query|Compares DIGESTS/i);
    expect(RUNBOOK).toMatch(/encode\(digest\(decrypted_secret, 'sha256'\)/);
  });

  it("defines the exact verified event for each filing transition", () => {
    expect(RUNBOOK).toMatch(/Queue row created\. `filings\.status` \*\*does not change/);
    expect(RUNBOOK).toMatch(/Worker claims a job\. `filings\.status` \*\*does not change/);
    expect(RUNBOOK).toMatch(/qualifier is `acknowledgement`/);
    expect(RUNBOOK).toMatch(/non-empty `CorrelationID`/);
    expect(RUNBOOK).toMatch(/`filings\.status` is not moved by a transport failure/);
  });

  it("flags the HMRC response semantics as unverified rather than asserting them", () => {
    expect(RUNBOOK).toMatch(/never successfully completed a cycle/);
    expect(RUNBOOK).toMatch(/stop and bring the\s*\nevidence rather than forcing the names/);
  });
});
