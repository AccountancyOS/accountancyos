import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Increment 2 Task 2: an accounts-prep workpaper must be bound to a job.
 * `createWorkpaperFromSnapshot` now REQUIRES `options.jobId`:
 *  - called without a jobId it throws the exact contract message (no silent null job_id).
 *  - called with a jobId it proceeds through to the workpaper_instances insert,
 *    writing the jobId onto job_id (no `|| null` fallback).
 */

// Track what the mocked supabase client is asked to do so we can assert the
// insert happens and carries the job_id.
const state: { insertedRows: unknown[] | null } = { insertedRows: null };

vi.mock("@/integrations/supabase/client", () => {
  const snapshot = {
    id: "snap-1",
    organization_id: "org-1",
    client_id: "client-1",
    company_id: "company-1",
    source_type: "manual",
    period_start: "2024-04-06",
    period_end: "2025-04-05",
    balances: [],
  };

  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = { __table: table, __inserted: false };
    for (const method of ["select", "eq", "update", "delete", "order"]) {
      builder[method] = () => builder;
    }
    builder.insert = (rows: unknown[]) => {
      builder.__inserted = true;
      state.insertedRows = rows;
      return builder;
    };
    builder.maybeSingle = async () => ({ data: null, error: null });
    builder.single = async () => {
      if (table === "trial_balance_snapshots" && !builder.__inserted) {
        return { data: snapshot, error: null };
      }
      if (table === "workpaper_instances" && builder.__inserted) {
        return { data: { id: "wp-1" }, error: null };
      }
      return { data: null, error: null };
    };
    return builder;
  };

  return {
    supabase: {
      from: (table: string) => makeBuilder(table),
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    },
  };
});

import { createWorkpaperFromSnapshot } from "@/lib/workpaper-from-tb";

beforeEach(() => {
  state.insertedRows = null;
});

describe("createWorkpaperFromSnapshot job binding (Increment 2 Task 2)", () => {
  it("throws the exact contract message when called without a jobId", async () => {
    await expect(
      // Cast bypasses the compile-time required-jobId check to exercise the runtime guard.
      createWorkpaperFromSnapshot("snap-1", "company_accounts", { name: "Accounts" } as never),
    ).rejects.toThrow("jobId is required to create an accounts-prep workpaper");
  });

  it("throws when jobId is an empty string", async () => {
    await expect(
      createWorkpaperFromSnapshot("snap-1", "company_accounts", { jobId: "" }),
    ).rejects.toThrow("jobId is required to create an accounts-prep workpaper");
  });

  it("proceeds to the workpaper insert and binds the jobId when provided", async () => {
    const result = await createWorkpaperFromSnapshot("snap-1", "company_accounts", {
      jobId: "job-42",
      name: "Accounts",
    });

    expect(result.success).toBe(true);
    expect(state.insertedRows).not.toBeNull();
    const row = (state.insertedRows as Array<Record<string, unknown>>)[0];
    expect(row.job_id).toBe("job-42");
  });
});
