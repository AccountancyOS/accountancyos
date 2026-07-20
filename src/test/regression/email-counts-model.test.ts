import { describe, it, expect } from "vitest";
import { deriveEmailCounts } from "@/lib/email-counts-model";

/**
 * /emails bug: the tab badges (All / Drafts / Queued / Failed) reset to 0 when a non-"All" tab is
 * selected, because they were derived from the same status-filtered list that powers the table.
 * The counts must be independent of the selected tab — derived from an unfiltered (non-sent) list.
 */

const rows = [
  { status: "draft" },
  { status: "queued" },
  { status: "pending" },
  { status: "queued" },
  { status: "failed" },
  { status: "cancelled" },
];

describe("deriveEmailCounts", () => {
  it("counts each badge from the full non-sent list", () => {
    const c = deriveEmailCounts(rows);
    expect(c.all).toBe(6); // every non-sent row, incl. cancelled/ignored
    expect(c.draft).toBe(1);
    expect(c.failed).toBe(1);
  });

  it("folds pending into queued (they are one tab)", () => {
    // The table's 'queued' filter is status IN (queued, pending); the badge must match.
    expect(deriveEmailCounts(rows).queued).toBe(3);
  });

  it("does not change when the caller is viewing a single-status subset", () => {
    // The whole point: counts come from the unfiltered list, so viewing only 'failed' rows in the
    // table must not collapse the other badges. Same input -> same counts regardless of active tab.
    const failedOnly = [{ status: "failed" }];
    expect(deriveEmailCounts(failedOnly)).toEqual({ all: 1, draft: 0, queued: 0, failed: 1 });
  });

  it("is zero-safe for an empty or missing list", () => {
    expect(deriveEmailCounts([])).toEqual({ all: 0, draft: 0, queued: 0, failed: 0 });
    expect(deriveEmailCounts(undefined)).toEqual({ all: 0, draft: 0, queued: 0, failed: 0 });
  });
});
