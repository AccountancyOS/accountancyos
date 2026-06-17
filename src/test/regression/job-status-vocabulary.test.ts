/**
 * Regression: job status vocabulary drift.
 *
 * The `public.jobs` table has a `chk_jobs_status` CHECK constraint that only
 * permits 9 canonical workflow statuses. Manual job creation previously failed
 * silently because `CreateJobDialog` defaulted to `not_started` (an old value
 * no longer in the constraint). This test locks down the SSOT so any future
 * drift fails CI before it reaches a user.
 *
 * The live DB-vs-constant comparison runs in `scripts/smoke-test.ts`.
 */
import { describe, expect, it } from "vitest";
import { JOB_STATUSES } from "@/lib/workflow-constants";
import { jobSchema } from "@/lib/validation-schemas";

const CANONICAL = [
  "blank",
  "records_requested",
  "records_received",
  "accountant_queries",
  "client_queries",
  "accountant_review",
  "client_review",
  "ready_to_file",
  "completed",
] as const;

const LEGACY = ["not_started", "in_progress", "waiting_on_client", "with_reviewer"] as const;

describe("job status vocabulary (SSOT)", () => {
  it("JOB_STATUSES equals the 9 canonical values in workflow order", () => {
    expect([...JOB_STATUSES]).toEqual([...CANONICAL]);
  });

  it("JOB_STATUSES contains none of the retired legacy values", () => {
    for (const legacy of LEGACY) {
      expect(JOB_STATUSES as readonly string[]).not.toContain(legacy);
    }
  });

  it("jobSchema.status accepts every canonical value", () => {
    for (const s of CANONICAL) {
      const r = jobSchema.safeParse({
        job_name: "x",
        client_id: "00000000-0000-0000-0000-000000000001",
        service_type: "accounts",
        status: s,
        priority: "normal",
      });
      expect(r.success, `expected status="${s}" to be accepted`).toBe(true);
    }
  });

  it("jobSchema.status rejects every retired legacy value", () => {
    for (const s of LEGACY) {
      const r = jobSchema.safeParse({
        job_name: "x",
        client_id: "00000000-0000-0000-0000-000000000001",
        service_type: "accounts",
        status: s,
        priority: "normal",
      });
      expect(r.success, `expected status="${s}" to be rejected`).toBe(false);
    }
  });
});