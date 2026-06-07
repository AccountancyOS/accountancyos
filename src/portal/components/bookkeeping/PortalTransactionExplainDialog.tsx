import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: {
    id: string;
    description: string | null;
    amount: number;
    transaction_date: string;
    client_explanation?: string | null;
  } | null;
}

export function PortalTransactionExplainDialog({ open, onOpenChange, transaction }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [explanation, setExplanation] = useState(transaction?.client_explanation ?? "");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!transaction) throw new Error("No transaction");
      const { error } = await supabase.rpc("portal_explain_transaction", {
        _transaction_id: transaction.id,
        _explanation: explanation,
        _suggested_account_id: undefined as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-pending-transactions"] });
      toast({ title: "Explanation Submitted", description: "Your accountant will review this categorisation." });
      onOpenChange(false);
      setExplanation("");
    },
    onError: (e: any) => {
      toast({ title: "Submission Failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Explain Transaction</DialogTitle>
          <DialogDescription>
            Tell your accountant what this transaction was for. They will review and categorise it.
          </DialogDescription>
        </DialogHeader>
        {transaction && (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-sm font-medium">{transaction.description ?? "Untitled"}</p>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{new Date(transaction.transaction_date).toLocaleDateString()}</span>
                <span className={transaction.amount < 0 ? "text-destructive" : "text-foreground"}>
                  {transaction.amount.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="explanation">What Was This For?</Label>
              <Textarea
                id="explanation"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="e.g. Office supplies from Amazon for the new printer"
                rows={4}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!explanation.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Submitting..." : "Submit For Review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}