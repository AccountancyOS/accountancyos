import { describe, it, expect } from "vitest";
import {
  summarizeReconciliation,
  type LifecycleReconciliationReport,
} from "@/lib/lifecycle-reconciliation";

/**
 * Fix 8 · Increment 1 — the reconciliation summary is the preflight gate for later increments.
 * These pin its decision logic (the RPC itself is read-only SQL, verified against the live DB).
 */
const CLEAN: LifecycleReconciliationReport = {
  success: true,
  organization_id: "org-1",
  jobs_total: 12,
  setup_pending_jobs: 0,
  null_period_label_jobs: 0,
  both_entity_jobs: 0,
  duplicate_job_groups: 0,
  duplicate_job_excess_rows: 0,
  null_label_duplicate_groups: 0,
  active_client_links: 5,
  backstop_indexes_present: [
    "jobs_client_period_uq",
    "jobs_company_period_uq",
    "engagements_quote_service_uq",
    "acl_active_client_uq",
    "acl_active_company_uq",
  ],
  backstop_indexes_missing: [],
};

describe("summarizeReconciliation (Fix 8 Inc 1)", () => {
  it("reports a fully clean org as clean and safe to tighten indexes", () => {
    const s = summarizeReconciliation(CLEAN);
    expect(s.clean).toBe(true);
    expect(s.blocksIndexTightening).toBe(false);
    expect(s.issues).toHaveLength(0);
  });

  it("duplicate jobs block index tightening and are listed", () => {
    const s = summarizeReconciliation({ ...CLEAN, duplicate_job_groups: 3, duplicate_job_excess_rows: 4 });
    expect(s.clean).toBe(false);
    expect(s.blocksIndexTightening).toBe(true);
    expect(s.issues.some((i) => i.includes("duplicate job group"))).toBe(true);
  });

  it("null-label duplicate groups block index tightening (Inc 8.5 preflight)", () => {
    const s = summarizeReconciliation({ ...CLEAN, null_label_duplicate_groups: 2 });
    expect(s.blocksIndexTightening).toBe(true);
    expect(s.clean).toBe(false);
  });

  it("Setup-Pending and null-label jobs make it unclean but don't alone block index tightening", () => {
    const s = summarizeReconciliation({ ...CLEAN, setup_pending_jobs: 1, null_period_label_jobs: 2 });
    expect(s.clean).toBe(false);
    expect(s.blocksIndexTightening).toBe(false); // no duplicate groups
    expect(s.issues).toHaveLength(2);
  });

  it("missing backstop indexes are surfaced but do not mark the data unclean", () => {
    const s = summarizeReconciliation({
      ...CLEAN,
      backstop_indexes_present: ["jobs_client_period_uq"],
      backstop_indexes_missing: ["jobs_company_period_uq", "engagements_quote_service_uq"],
    });
    expect(s.clean).toBe(true);
    expect(s.issues.some((i) => i.includes("missing backstop indexes"))).toBe(true);
  });

  it("a failed report is treated as unsafe", () => {
    const s = summarizeReconciliation({ success: false, error: "Access denied" });
    expect(s.clean).toBe(false);
    expect(s.blocksIndexTightening).toBe(true);
    expect(s.issues[0]).toBe("Access denied");
  });
});
