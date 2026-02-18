import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { getVatCodeLabel } from "@/lib/vat-code-utils";

interface CategorizeBankTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity;
  transaction: any;
}

interface CategorizeFormData {
  account_id: string;
  vat_code_id: string;
  description: string;
}

export function CategorizeBankTransactionDialog({
  open,
  onOpenChange,
  entity,
  transaction,
}: CategorizeBankTransactionDialogProps) {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { register, handleSubmit, watch, setValue, reset } = useForm<CategorizeFormData>({
    defaultValues: {
      account_id: "",
      vat_code_id: "",
      description: transaction?.description || "",
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ["bookkeeping-accounts", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const query = supabase
        .from("bookkeeping_accounts")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("code");

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id && open,
  });

  const { data: vatCodes } = useQuery({
    queryKey: ["vat-codes", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const { data, error } = await supabase
        .from("vat_codes")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("code");

      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id && open,
  });

  const [showAllVatCodes, setShowAllVatCodes] = useState(false);

  const filteredVatCodes = useMemo(() => {
    if (!vatCodes) return [];
    return showAllVatCodes ? vatCodes : vatCodes.filter((v) => v.is_common);
  }, [vatCodes, showAllVatCodes]);

  const categorizeMutation = useMutation({
    mutationFn: async (data: CategorizeFormData) => {
      if (!organization?.id || !transaction) throw new Error("Missing data");

      // Create ledger entry
      const isDebit = transaction.amount < 0;
      const absAmount = Math.abs(transaction.amount);

      const ledgerEntry: any = {
        organization_id: organization.id,
        client_id: entity.type === "client" ? entity.id : null,
        company_id: entity.type === "company" ? entity.id : null,
        transaction_date: transaction.transaction_date,
        account_id: data.account_id,
        debit: isDebit ? absAmount : null,
        credit: !isDebit ? absAmount : null,
        vat_code_id: data.vat_code_id || null,
        description: data.description,
        source_type: "BANK_FEED",
        source_id: transaction.id,
        created_by: user?.id,
      };

      const { data: createdEntry, error: ledgerError } = await supabase
        .from("ledger_entries")
        .insert(ledgerEntry)
        .select()
        .single();

      if (ledgerError) throw ledgerError;

      // Update bank transaction status
      const { error: updateError } = await supabase
        .from("bank_transactions")
        .update({
          status: "MATCHED",
          matched_ledger_entry_id: createdEntry.id,
        })
        .eq("id", transaction.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
      toast.success("Transaction categorized");
      reset();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to categorize transaction", {
        description: error.message,
      });
    },
  });

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Categorize Transaction</DialogTitle>
          <DialogDescription>
            {transaction.description} ({transaction.amount > 0 ? "+" : ""}
            {transaction.amount})
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((data) => categorizeMutation.mutate(data))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Account</Label>
            <Select
              value={watch("account_id")}
              onValueChange={(value) => setValue("account_id", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts?.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>VAT Code (optional)</Label>
            <Select
              value={watch("vat_code_id")}
              onValueChange={(value) => setValue("vat_code_id", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select VAT code" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No VAT</SelectItem>
                {(() => {
                  const selectedId = watch("vat_code_id");
                  const selectedVat = vatCodes?.find((v) => v.id === selectedId);
                  const opts = selectedVat && !filteredVatCodes.some((v) => v.id === selectedVat.id)
                    ? [selectedVat, ...filteredVatCodes]
                    : filteredVatCodes;
                  return opts.map((code) => (
                    <SelectItem key={code.id} value={code.id}>
                      {getVatCodeLabel(code)}
                    </SelectItem>
                  ));
                })()}
              </SelectContent>
            </Select>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline cursor-pointer"
              onClick={() => setShowAllVatCodes((v) => !v)}
            >
              {showAllVatCodes ? "Show common only" : "Show all codes"}
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register("description", { required: true })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={categorizeMutation.isPending}>
              {categorizeMutation.isPending ? "Saving..." : "Categorize & Match"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
