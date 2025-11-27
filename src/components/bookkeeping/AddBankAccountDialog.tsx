import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface AddBankAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity;
  editAccount?: any;
}

interface BankAccountFormData {
  name: string;
  account_id: string;
  currency: string;
}

export function AddBankAccountDialog({
  open,
  onOpenChange,
  entity,
  editAccount,
}: AddBankAccountDialogProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const { register, handleSubmit, watch, setValue, reset } = useForm<BankAccountFormData>({
    defaultValues: editAccount || {
      name: "",
      account_id: "",
      currency: "GBP",
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ["bookkeeping-accounts-bank", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const query = supabase
        .from("bookkeeping_accounts")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("account_type", "ASSET")
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

  const createMutation = useMutation({
    mutationFn: async (data: BankAccountFormData) => {
      if (!organization?.id) throw new Error("No organization");

      const payload: any = {
        organization_id: organization.id,
        ...data,
      };

      if (entity.type === "client") {
        payload.client_id = entity.id;
      } else {
        payload.company_id = entity.id;
      }

      if (editAccount) {
        const { error } = await supabase
          .from("bank_accounts")
          .update(payload)
          .eq("id", editAccount.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("bank_accounts")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      toast.success(editAccount ? "Bank account updated" : "Bank account created");
      reset();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to save bank account", {
        description: error.message,
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {editAccount ? "Edit Bank Account" : "Add Bank Account"}
          </DialogTitle>
          <DialogDescription>
            Link a bank account to track transactions
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Account Name</Label>
            <Input
              id="name"
              placeholder="e.g. Barclays Current Account"
              {...register("name", { required: true })}
            />
          </div>

          <div className="space-y-2">
            <Label>Linked Chart of Accounts</Label>
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
            <Label>Currency</Label>
            <Select
              value={watch("currency")}
              onValueChange={(value) => setValue("currency", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GBP">GBP (£)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending
                ? "Saving..."
                : editAccount
                ? "Update Account"
                : "Create Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
