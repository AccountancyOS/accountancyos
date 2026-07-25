import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createWorkpaperFromSnapshot } from "@/lib/workpaper-from-tb";
import type { BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { ImportTrialBalanceDialog } from "@/components/bookkeeping/ImportTrialBalanceDialog";
import { TBGridEditor, type TBLineItem } from "@/components/bookkeeping/TBGridEditor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Database, Upload, PencilLine, FileSpreadsheet, ArrowRight } from "lucide-react";

/**
 * PrepareAccountsDialog — Increment 2, Task 3.
 *
 * One-click, job-side "Prepare accounts" flow. The accountant picks a
 * trial-balance source (native ledger / import / manual), a *draft*,
 * ledger-backed snapshot is created via `create_tb_snapshot`, and the
 * existing `createWorkpaperFromSnapshot` is called with the job pre-bound.
 *
 * This dialog NEVER locks or finalises anything — finalise/filing is
 * Increment 3. The primary action is always labelled "Prepare accounts".
 */

export type PrepareAccountsJob = {
  id: string;
  organization_id: string;
  client_id: string | null;
  company_id: string | null;
  period_start: string | null;
  period_end: string | null;
  service_type: string;
};

interface PrepareAccountsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: PrepareAccountsJob;
  /** Optional entity display name for the import/manual sub-dialogs. */
  entityName?: string;
  onCreated: (workpaperId: string) => void;
}

type TBSource = "native" | "import" | "manual";

type WorkpaperType = "company_accounts" | "ct600" | "self_assessment" | "vat_return";

/**
 * Map a job's `service_type` to the workpaper type consumed by
 * `createWorkpaperFromSnapshot` (which itself maps company_accounts→accounts,
 * etc). Mirrors the vocabulary used by CreateWorkpaperFromSnapshotDialog.
 */
export function jobServiceTypeToWorkpaperType(serviceType: string): WorkpaperType {
  const key = (serviceType || "").toLowerCase();
  if (["ct600", "corporation_tax", "ct"].includes(key)) return "ct600";
  if (
    ["self_assessment", "sa100", "sa", "sa_non_mtd", "sa_mtd"].includes(key)
  ) {
    return "self_assessment";
  }
  if (["vat", "vat_return"].includes(key)) return "vat_return";
  // "accounts", "company_accounts" and anything unrecognised default to full
  // company accounts, which is the safest superset for accounts preparation.
  return "company_accounts";
}

export function PrepareAccountsDialog({
  open,
  onOpenChange,
  job,
  entityName,
  onCreated,
}: PrepareAccountsDialogProps) {
  const [source, setSource] = useState<TBSource>("native");
  const [submitting, setSubmitting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const workpaperType = jobServiceTypeToWorkpaperType(job.service_type);

  const entity: BookkeepingEntity = job.company_id
    ? {
        type: "company",
        id: job.company_id,
        name: entityName || "Company",
        displayName: entityName || "Company",
      }
    : {
        type: "client",
        id: job.client_id || "",
        name: entityName || "Client",
        displayName: entityName || "Client",
      };

  // Build the job-bound workpaper from a freshly-created draft snapshot.
  const buildWorkpaper = async (snapshotId: string) => {
    const result = await createWorkpaperFromSnapshot(snapshotId, workpaperType, {
      jobId: job.id,
    });
    if (!result?.success || !result.workpaperId) {
      throw new Error(result?.error || "Failed to create workpaper");
    }
    onCreated(result.workpaperId);
    toast.success("Draft accounts workpaper created", {
      description: "Draft — not for filing",
    });
    onOpenChange(false);
  };

  const handleNative = async () => {
    setSubmitting(true);
    try {
      // `create_tb_snapshot` ships in a migration applied via Lovable; the
      // generated Supabase types lag until that is regenerated, so the RPC name
      // is cast (matching the repo's established pattern for pending-type RPCs).
      const { data: snapshotId, error } = await supabase.rpc(
        "create_tb_snapshot" as never,
        {
          p_org: job.organization_id,
          p_client_id: job.client_id,
          p_company_id: job.company_id,
          p_job_id: job.id,
          p_period_start: job.period_start,
          p_period_end: job.period_end,
          p_source_type: "native",
        } as never,
      );

      if (error) throw error;
      if (!snapshotId) throw new Error("Snapshot was not created");

      await buildWorkpaper(snapshotId as unknown as string);
    } catch (err) {
      toast.error("Failed to prepare accounts", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Manual: TBGridEditor hands us the edited lines; we persist them as a draft
  // manual snapshot via the RPC, then build the job-bound workpaper.
  const handleManualLines = async (lines: TBLineItem[]) => {
    setSubmitting(true);
    try {
      const balances = lines.map((l) => ({
        accountId: l.account_id,
        accountCode: l.account_code,
        accountName: l.account_name,
        accountType: l.account_type,
        openingBalance: 0,
        debit: l.debit,
        credit: l.credit,
        closingBalance: l.debit - l.credit,
      }));

      const { data: snapshotId, error } = await supabase.rpc(
        "create_tb_snapshot" as never,
        {
          p_org: job.organization_id,
          p_client_id: job.client_id,
          p_company_id: job.company_id,
          p_job_id: job.id,
          p_period_start: job.period_start,
          p_period_end: job.period_end,
          p_source_type: "manual",
          p_balances: balances,
        } as never,
      );

      if (error) throw error;
      if (!snapshotId) throw new Error("Snapshot was not created");

      setShowManual(false);
      await buildWorkpaper(snapshotId as unknown as string);
    } catch (err) {
      toast.error("Failed to prepare accounts", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Import: the existing dialog creates the draft snapshot and hands us its id
  // (via the additive onSnapshotCreated prop). We then build the workpaper.
  const handleImportSnapshot = async (snapshotId: string) => {
    setShowImport(false);
    setSubmitting(true);
    try {
      await buildWorkpaper(snapshotId);
    } catch (err) {
      toast.error("Failed to prepare accounts", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrimary = () => {
    if (source === "native") {
      void handleNative();
    } else if (source === "import") {
      setShowImport(true);
    } else {
      setShowManual(true);
    }
  };

  const options: Array<{
    value: TBSource;
    label: string;
    description: string;
    icon: typeof Database;
  }> = [
    {
      value: "native",
      label: "Use native ledger",
      description: "Build the trial balance from this entity's AccountancyOS ledger.",
      icon: Database,
    },
    {
      value: "import",
      label: "Import trial balance",
      description: "Upload a trial balance exported from Xero, QuickBooks, Sage, etc.",
      icon: Upload,
    },
    {
      value: "manual",
      label: "Enter manually",
      description: "Type or paste the trial balance into an editable grid.",
      icon: PencilLine,
    },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Prepare accounts
            </DialogTitle>
            <DialogDescription>
              Create a draft, ledger-backed accounts workpaper for this job. Nothing
              is locked or filed — this produces a draft you can review.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Label>Trial balance source</Label>
            <RadioGroup
              value={source}
              onValueChange={(v) => setSource(v as TBSource)}
              className="space-y-2"
            >
              {options.map((opt) => {
                const Icon = opt.icon;
                return (
                  <label
                    key={opt.value}
                    htmlFor={`tb-source-${opt.value}`}
                    className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 [&:has([data-state=checked])]:border-primary"
                  >
                    <RadioGroupItem
                      value={opt.value}
                      id={`tb-source-${opt.value}`}
                      className="mt-1"
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-medium">
                        <Icon className="h-4 w-4" />
                        {opt.label}
                      </div>
                      <p className="text-sm text-muted-foreground">{opt.description}</p>
                    </div>
                  </label>
                );
              })}
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handlePrimary} disabled={submitting}>
              <ArrowRight className="h-4 w-4 mr-2" />
              {submitting ? "Preparing..." : "Prepare accounts"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import branch — existing dialog pre-bound to the job's entity + period. */}
      {showImport && job.period_start && job.period_end && (
        <ImportTrialBalanceDialog
          open={showImport}
          onOpenChange={setShowImport}
          entity={entity}
          periodStart={new Date(job.period_start)}
          periodEnd={new Date(job.period_end)}
          onSnapshotCreated={handleImportSnapshot}
        />
      )}

      {/* Manual branch — existing grid pre-bound; its lines become a draft snapshot. */}
      {showManual && job.period_start && job.period_end && (
        <Dialog open={showManual} onOpenChange={setShowManual}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Enter trial balance</DialogTitle>
              <DialogDescription>
                Enter the trial balance for this job, then send it to workpapers to
                create the draft accounts workpaper.
              </DialogDescription>
            </DialogHeader>
            <TBGridEditor
              entity={entity}
              periodStart={job.period_start}
              periodEnd={job.period_end}
              onSnapshotReady={handleManualLines}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
