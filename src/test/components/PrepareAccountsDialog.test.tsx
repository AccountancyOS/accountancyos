import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Increment 2 Task 3: one-click "Prepare accounts" from a job.
 *
 * The "Use native ledger" branch (the default) must, on confirm:
 *  1. call the `create_tb_snapshot` RPC with the job's org / entity / period,
 *  2. then call `createWorkpaperFromSnapshot(snapshotId, mappedType, { jobId })`,
 *  3. then invoke `onCreated` with the new workpaper id.
 *
 * We mock both the supabase client and the workpaper lib so nothing hits the
 * network and we can assert the exact call payloads.
 */

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

const createWorkpaperFromSnapshotMock = vi.fn();

vi.mock("@/lib/workpaper-from-tb", () => ({
  createWorkpaperFromSnapshot: (...args: unknown[]) =>
    createWorkpaperFromSnapshotMock(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { PrepareAccountsDialog } from "@/components/jobs/PrepareAccountsDialog";

const job = {
  id: "job-42",
  organization_id: "org-1",
  client_id: null,
  company_id: "company-9",
  period_start: "2024-04-01",
  period_end: "2025-03-31",
  service_type: "accounts",
};

beforeEach(() => {
  rpcMock.mockReset();
  createWorkpaperFromSnapshotMock.mockReset();
});

describe("PrepareAccountsDialog — native ledger branch", () => {
  it("creates a draft snapshot from the ledger then a job-bound workpaper", async () => {
    rpcMock.mockResolvedValue({ data: "snap-99", error: null });
    createWorkpaperFromSnapshotMock.mockResolvedValue({
      success: true,
      workpaperId: "wp-1",
    });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <PrepareAccountsDialog
        open
        onOpenChange={onOpenChange}
        job={job}
        onCreated={onCreated}
      />,
    );

    // Native is the default selection — just confirm.
    await userEvent.click(
      screen.getByRole("button", { name: "Prepare accounts" }),
    );

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    expect(rpcMock).toHaveBeenCalledWith("create_tb_snapshot", {
      p_org: "org-1",
      p_client_id: null,
      p_company_id: "company-9",
      p_job_id: "job-42",
      p_period_start: "2024-04-01",
      p_period_end: "2025-03-31",
      p_source_type: "native",
    });

    await waitFor(() =>
      expect(createWorkpaperFromSnapshotMock).toHaveBeenCalledTimes(1),
    );
    expect(createWorkpaperFromSnapshotMock).toHaveBeenCalledWith(
      "snap-99",
      "company_accounts",
      { jobId: "job-42" },
    );

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("wp-1"));
  });
});
