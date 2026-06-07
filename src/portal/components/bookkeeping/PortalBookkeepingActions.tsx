import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Receipt, FileCheck2, HelpCircle } from "lucide-react";
import { usePortalEntity } from "../../contexts/PortalEntityContext";
import { usePortalBookkeepingPermissions } from "../../hooks/usePortalBookkeepingPermissions";
import { PortalTransactionExplainDialog } from "./PortalTransactionExplainDialog";

/**
 * Client-facing action queue. Surfaces the two things a client uniquely does
 * inside bookkeeping: explain unrecognised bank transactions and approve VAT
 * returns the accountant has prepared. Everything else (categorising, posting,
 * filing) stays with the accountant.
 */
export function PortalBookkeepingActions() {
  const { currentEntity } = usePortalEntity();
  const { data: perms } = usePortalBookkeepingPermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [explainTxn, setExplainTxn] = useState<any | null>(null);

  const entityCol = currentEntity?.type === "client" ? "client_id" : "company_id";

  const { data: pendingTxns = [] } = useQuery({
    queryKey: ["portal-pending-transactions", currentEntity?.type, currentEntity?.id],
    queryFn: async () => {
      if (!currentEntity) return [];
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("id, description, amount, transaction_date, client_explanation, client_explained_status")
        .eq(entityCol, currentEntity.id)
        .is("matched_ledger_entry_id", null)
        .or("client_explained_status.is.null,client_explained_status.eq.unexplained")
        .order("transaction_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentEntity && !!perms?.allowTransactionExplain,
  });

  const { data: pendingVAT = [] } = useQuery({
    queryKey: ["portal-pending-vat", currentEntity?.type, currentEntity?.id],
    queryFn: async () => {
      if (!currentEntity) return [];
      const { data, error } = await supabase
        .from("vat_returns")
        .select("id, period_start, period_end, box_5_net_vat, client_approval_required, client_approved_at")
        .eq(entityCol, currentEntity.id)
        .eq("client_approval_required", true)
        .is("client_approved_at", null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentEntity && !!perms?.allowVATApproval,
  });

  const approveVAT = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("portal_approve_vat_return", { _vat_return_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-pending-vat"] });
      toast({ title: "VAT Return Approved", description: "Your accountant has been notified." });
    },
    onError: (e: any) => {
      toast({ title: "Approval Failed", description: e.message, variant: "destructive" });
    },
  });

  const showExplain = !!perms?.allowTransactionExplain;
  const showVAT = !!perms?.allowVATApproval;

  if (!showExplain && !showVAT) return null;

  const nothingPending = pendingTxns.length === 0 && pendingVAT.length === 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5" /> Your Action Queue
          </CardTitle>
          <CardDescription>
            Items waiting on you. Everything else is being handled by your accountant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {nothingPending && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nothing to action right now. We will let you know if anything comes up.
            </p>
          )}

          {showVAT && pendingVAT.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">VAT Returns To Approve</h4>
                <Badge variant="secondary">{pendingVAT.length}</Badge>
              </div>
              {pendingVAT.map((vat: any) => (
                <div key={vat.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <p className="text-sm font-medium">
                      Period {new Date(vat.period_start).toLocaleDateString()} – {new Date(vat.period_end).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Net VAT: {Number(vat.box_5_net_vat ?? 0).toFixed(2)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => approveVAT.mutate(vat.id)}
                    disabled={approveVAT.isPending}
                  >
                    Approve
                  </Button>
                </div>
              ))}
            </div>
          )}

          {showExplain && pendingTxns.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> Transactions Needing An Explanation
                </h4>
                <Badge variant="secondary">{pendingTxns.length}</Badge>
              </div>
              {pendingTxns.map((txn: any) => (
                <div key={txn.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{txn.description ?? "Untitled"}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>{new Date(txn.transaction_date).toLocaleDateString()}</span>
                      <span className={Number(txn.amount) < 0 ? "text-destructive" : ""}>
                        {Number(txn.amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setExplainTxn(txn)}>
                    <HelpCircle className="h-4 w-4 mr-1" /> Explain
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PortalTransactionExplainDialog
        open={!!explainTxn}
        onOpenChange={(o) => !o && setExplainTxn(null)}
        transaction={explainTxn}
      />
    </>
  );
}