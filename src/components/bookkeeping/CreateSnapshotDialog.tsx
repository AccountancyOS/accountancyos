import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Camera, Check, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/bookkeeping-utils";

interface CreateSnapshotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity;
  periodStart: Date;
  periodEnd: Date;
  trialBalanceData: {
    accounts: any[];
    totals: any;
  } | null;
}

export function CreateSnapshotDialog({
  open,
  onOpenChange,
  entity,
  periodStart,
  periodEnd,
  trialBalanceData,
}: CreateSnapshotDialogProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");

  const isBalanced = trialBalanceData 
    ? Math.abs(trialBalanceData.totals.periodDebit - trialBalanceData.totals.periodCredit) < 0.01
    : false;

  const createSnapshotMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !trialBalanceData) throw new Error("Missing data");

      // Build balances array from current TB
      const balances = trialBalanceData.accounts.map(account => ({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.account_type,
        openingBalance: account.openingBalance,
        debit: account.periodDebit,
        credit: account.periodCredit,
        closingBalance: account.closingBalance,
      }));

      const { data, error } = await supabase
        .from("trial_balance_snapshots")
        .insert({
          organization_id: organization.id,
          client_id: entity.type === "client" ? entity.id : null,
          company_id: entity.type === "company" ? entity.id : null,
          period_start: periodStart.toISOString().split("T")[0],
          period_end: periodEnd.toISOString().split("T")[0],
          source_type: "native",
          status: "draft",
          balances,
          notes,
          metadata: {
            createdAt: new Date().toISOString(),
            accountCount: trialBalanceData.accounts.length,
            totals: trialBalanceData.totals,
          },
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trial-balance-snapshots"] });
      toast.success("TB Snapshot created", {
        description: "You can now create workpapers from this snapshot",
      });
      onOpenChange(false);
      setNotes("");
    },
    onError: (error: any) => {
      toast.error("Failed to create snapshot", { description: error.message });
    },
  });

  if (!trialBalanceData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Trial Balance Snapshot</DialogTitle>
          <DialogDescription>
            Freeze the current trial balance for {entity.name} to use in workpapers
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Period info */}
          <div className="bg-muted rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Period Start</span>
                <p className="font-medium">{periodStart.toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Period End</span>
                <p className="font-medium">{periodEnd.toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Accounts</span>
                <p className="font-medium">{trialBalanceData.accounts.length}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Source</span>
                <p className="font-medium">AccountancyOS Ledger</p>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Total Debits</p>
              <p className="text-lg font-bold">{formatCurrency(trialBalanceData.totals.periodDebit)}</p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Total Credits</p>
              <p className="text-lg font-bold">{formatCurrency(trialBalanceData.totals.periodCredit)}</p>
            </div>
          </div>

          {/* Balance check */}
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            isBalanced ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
          }`}>
            {isBalanced ? (
              <>
                <Check className="h-5 w-5" />
                <span>Trial balance is in balance</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5" />
                <span>
                  Warning: TB out of balance by{" "}
                  {formatCurrency(Math.abs(trialBalanceData.totals.periodDebit - trialBalanceData.totals.periodCredit))}
                </span>
              </>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this snapshot..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createSnapshotMutation.mutate()}
            disabled={createSnapshotMutation.isPending}
          >
            <Camera className="h-4 w-4 mr-2" />
            {createSnapshotMutation.isPending ? "Creating..." : "Create Snapshot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
