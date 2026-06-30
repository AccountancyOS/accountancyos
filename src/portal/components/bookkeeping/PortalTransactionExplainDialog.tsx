import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface PortalEntityRef {
  type: "client" | "company";
  id: string;
}

interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

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
  entity: PortalEntityRef | null;
  /** allow_client_post_to_ledger — when true the client categorises (posts), else explains. */
  canPost: boolean;
}

export function PortalTransactionExplainDialog({ open, onOpenChange, transaction, entity, canPost }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [explanation, setExplanation] = useState("");
  const [accountId, setAccountId] = useState("");

  useEffect(() => {
    if (open) {
      setExplanation(transaction?.client_explanation ?? "");
      setAccountId("");
    }
  }, [open, transaction]);

  // Category options (org chart of accounts) — only needed when the client can post.
  const { data: accounts = [] } = useQuery({
    queryKey: ["portal-ledger-accounts", entity?.type, entity?.id],
    queryFn: async () => {
      if (!entity) return [];
      const { data, error } = await (supabase as any).rpc("portal_list_ledger_accounts", {
        p_client_id: entity.type === "client" ? entity.id : null,
        p_company_id: entity.type === "company" ? entity.id : null,
      });
      if (error) throw error;
      return (data ?? []) as LedgerAccount[];
    },
    enabled: open && canPost && !!entity,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!transaction) throw new Error("No transaction");
      if (canPost) {
        const { data, error } = await (supabase as any).rpc("portal_categorise_transaction", {
          p_bank_transaction_id: transaction.id,
          p_contra_account_id: accountId,
          p_vat_code_id: null,
          p_vat_amount: 0,
          p_description: explanation.trim() || null,
        });
        if (error) throw error;
        if (data && (data as any).success === false) {
          throw new Error((data as any).error_message || "Could not categorise this transaction");
        }
      } else {
        const { error } = await supabase.rpc("portal_explain_transaction", {
          _transaction_id: transaction.id,
          _explanation: explanation,
          _suggested_account_id: (accountId || null) as any,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-pending-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "financial"] });
      toast({
        title: canPost ? "Transaction Categorised" : "Explanation Submitted",
        description: canPost
          ? "Posted to your books. Your accountant can re-categorise it if needed."
          : "Your accountant will review and categorise this.",
      });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    },
  });

  const canSubmit = canPost ? !!accountId : !!explanation.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{canPost ? "Categorise Transaction" : "Explain Transaction"}</DialogTitle>
          <DialogDescription>
            {canPost
              ? "Choose the category to post this transaction to. Your accountant can re-categorise it if needed."
              : "Tell your accountant what this transaction was for. They will review and categorise it."}
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

            {canPost && (
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} <span className="text-muted-foreground">({a.account_type.toLowerCase()})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="explanation">{canPost ? "Note (optional)" : "What Was This For?"}</Label>
              <Textarea
                id="explanation"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="e.g. Office supplies from Amazon for the new printer"
                rows={3}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending
              ? (canPost ? "Posting…" : "Submitting…")
              : (canPost ? "Categorise" : "Submit For Review")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
