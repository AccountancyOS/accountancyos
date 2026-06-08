import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import type { BookkeepingEntity } from "./EntitySelector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { format } from "date-fns";
import { Check, AlertTriangle } from "lucide-react";

interface AllocateCreditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditNote: any;
  entity: BookkeepingEntity;
}

interface AllocationRow {
  documentId: string;
  documentNumber: string;
  documentDate: string;
  originalAmount: number;
  outstanding: number;
  allocation: number;
}

export function AllocateCreditDialog({
  open,
  onOpenChange,
  creditNote,
  entity,
}: AllocateCreditDialogProps) {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  const isSalesCredit = creditNote?.credit_note_type === "SALES";
  const remainingCredit = Number(creditNote?.remaining_allocation || creditNote?.total || 0);

  // Fetch eligible documents (invoices for sales CN, bills for purchase CN)
  const { data: documents, isLoading } = useQuery({
    queryKey: [
      isSalesCredit ? "open-invoices-for-allocation" : "open-bills-for-allocation",
      organization?.id,
      entity.type,
      entity.id,
      isSalesCredit ? creditNote?.customer_id : creditNote?.supplier_id,
    ],
    queryFn: async () => {
      if (!organization?.id) return [];

      if (isSalesCredit) {
        // Fetch open invoices for this customer
        const query = supabase
          .from("invoices")
          .select("id, invoice_number, issue_date, total_gross, amount_paid, remaining_balance")
          .eq("organization_id", organization.id)
          .eq("invoice_type", "SALES")
          .eq("is_posted", true)
          .in("status", ["AWAITING_PAYMENT", "PART_PAID"]);

        if (creditNote?.customer_id) {
          query.eq("customer_id", creditNote.customer_id);
        }

        if (entity.type === "client") {
          query.eq("client_id", entity.id);
        } else {
          query.eq("company_id", entity.id);
        }

        const { data } = await query.order("issue_date");
        return (data || []).map((inv) => ({
          id: inv.id,
          number: inv.invoice_number || inv.id.substring(0, 8),
          date: inv.issue_date,
          originalAmount: Number(inv.total_gross),
          outstanding: Number(inv.remaining_balance || inv.total_gross) - Number(inv.amount_paid || 0),
        }));
      } else {
        // Fetch open bills for this supplier
        const query = supabase
          .from("bills")
          .select("id, bill_number, issue_date, total_gross, amount_paid, remaining_balance")
          .eq("organization_id", organization.id)
          .eq("is_posted", true)
          .in("status", ["AWAITING_PAYMENT", "PART_PAID"]);

        if (creditNote?.supplier_id) {
          query.eq("supplier_id", creditNote.supplier_id);
        }

        if (entity.type === "client") {
          query.eq("client_id", entity.id);
        } else {
          query.eq("company_id", entity.id);
        }

        const { data } = await query.order("issue_date");
        return (data || []).map((bill) => ({
          id: bill.id,
          number: bill.bill_number || bill.id.substring(0, 8),
          date: bill.issue_date,
          originalAmount: Number(bill.total_gross),
          outstanding: Number(bill.remaining_balance || bill.total_gross) - Number(bill.amount_paid || 0),
        }));
      }
    },
    enabled: open && !!organization?.id && !!creditNote,
  });

  // Initialize allocations when documents load
  useEffect(() => {
    if (documents) {
      let creditRemaining = remainingCredit;
      const initialAllocations: AllocationRow[] = documents.map((doc) => {
        const alloc = Math.min(creditRemaining, doc.outstanding);
        creditRemaining -= alloc;
        return {
          documentId: doc.id,
          documentNumber: doc.number,
          documentDate: doc.date,
          originalAmount: doc.originalAmount,
          outstanding: doc.outstanding,
          allocation: alloc > 0 ? alloc : 0,
        };
      });
      setAllocations(initialAllocations);
    }
  }, [documents, remainingCredit]);

  const updateAllocation = (documentId: string, amount: number) => {
    setAllocations((prev) =>
      prev.map((a) => {
        if (a.documentId === documentId) {
          // Clamp to valid range
          const clamped = Math.max(0, Math.min(amount, a.outstanding));
          return { ...a, allocation: clamped };
        }
        return a;
      })
    );
  };

  const totalAllocated = allocations.reduce((sum, a) => sum + a.allocation, 0);
  const creditRemainingAfter = remainingCredit - totalAllocated;
  const isOverAllocated = totalAllocated > remainingCredit;

  const allocateMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !user?.id) throw new Error("Missing context");
      if (isOverAllocated) throw new Error("Cannot allocate more than remaining credit");

      const allocationsToApply = allocations.filter((a) => a.allocation > 0);

      if (allocationsToApply.length === 0) {
        throw new Error("No allocations to apply");
      }

      const payload = allocationsToApply.map((a) => ({
        document_id: a.documentId,
        amount: a.allocation,
      }));

      const { data, error } = await supabase.rpc("allocate_credit_note", {
        p_credit_note_id: creditNote.id,
        p_allocations: payload,
        p_user_id: user.id,
      });
      if (error) throw error;
      const result = data as { success: boolean; error_message?: string };
      if (!result?.success) throw new Error(result?.error_message || "Allocation failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      toast.success("Credit allocated successfully");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to allocate credit", { description: error.message });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Allocate Credit Note</DialogTitle>
        </DialogHeader>

        {/* Credit Note Summary */}
        <div className="p-4 bg-muted rounded-lg space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Credit Note:</span>
            <span className="font-medium">
              {creditNote?.credit_note_number || creditNote?.id?.substring(0, 8)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Type:</span>
            <Badge variant="outline">{isSalesCredit ? "Sales" : "Purchase"}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Original Amount:</span>
            <span className="font-mono">{formatCurrency(creditNote?.total || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Already Allocated:</span>
            <span className="font-mono">{formatCurrency(Number(creditNote?.total || 0) - Number(creditNote?.remaining_allocation || 0))}</span>
          </div>
          <div className="flex justify-between font-bold border-t pt-2">
            <span>Available to Allocate:</span>
            <span className="font-mono">{formatCurrency(remainingCredit)}</span>
          </div>
        </div>

        {/* Documents to allocate to */}
        <div className="space-y-2">
          <h3 className="font-medium">
            {isSalesCredit ? "Open Invoices" : "Open Bills"}
          </h3>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open {isSalesCredit ? "invoices" : "bills"} found for allocation
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Document</th>
                    <th className="text-left p-2">Date</th>
                    <th className="text-right p-2">Original</th>
                    <th className="text-right p-2">Outstanding</th>
                    <th className="text-right p-2">Allocate</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((row) => (
                    <tr key={row.documentId} className="border-t">
                      <td className="p-2 font-medium">{row.documentNumber}</td>
                      <td className="p-2">
                        {format(new Date(row.documentDate), "dd/MM/yyyy")}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {formatCurrency(row.originalAmount)}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {formatCurrency(row.outstanding)}
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          max={row.outstanding}
                          value={row.allocation}
                          onChange={(e) =>
                            updateAllocation(row.documentId, Number(e.target.value))
                          }
                          className="w-24 text-right"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Total Allocated:</span>
              <span className="font-mono">{formatCurrency(totalAllocated)}</span>
            </div>
            <div
              className={`flex justify-between font-bold ${
                isOverAllocated ? "text-destructive" : ""
              }`}
            >
              <span>Remaining Credit:</span>
              <span className="font-mono">{formatCurrency(creditRemainingAfter)}</span>
            </div>
            {isOverAllocated && (
              <div className="flex items-center gap-1 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span>Cannot exceed available credit</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => allocateMutation.mutate()}
            disabled={
              allocateMutation.isPending ||
              isOverAllocated ||
              totalAllocated <= 0
            }
          >
            <Check className="h-4 w-4 mr-2" />
            Allocate Credit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
