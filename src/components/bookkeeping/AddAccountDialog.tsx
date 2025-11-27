import { useForm } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity;
  editAccount?: any;
}

interface AccountFormData {
  code: string;
  name: string;
  account_type: string;
  account_subtype: string;
  is_bank_account: boolean;
  is_control_account: boolean;
}

const ACCOUNT_TYPES = [
  { value: "ASSET", label: "Asset" },
  { value: "LIABILITY", label: "Liability" },
  { value: "EQUITY", label: "Equity" },
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
];

const ACCOUNT_SUBTYPES: Record<string, string[]> = {
  ASSET: ["CURRENT_ASSET", "FIXED_ASSET"],
  LIABILITY: ["CURRENT_LIABILITY", "LONG_TERM_LIABILITY"],
  EQUITY: ["EQUITY", "RETAINED_EARNINGS", "DRAWINGS"],
  INCOME: ["SALES", "OTHER_INCOME"],
  EXPENSE: ["COST_OF_SALES", "OVERHEAD", "FINANCE"],
};

export function AddAccountDialog({
  open,
  onOpenChange,
  entity,
  editAccount,
}: AddAccountDialogProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const { register, handleSubmit, watch, setValue, reset } = useForm<AccountFormData>({
    defaultValues: editAccount || {
      code: "",
      name: "",
      account_type: "ASSET",
      account_subtype: "CURRENT_ASSET",
      is_bank_account: false,
      is_control_account: false,
    },
  });

  const accountType = watch("account_type");

  const createMutation = useMutation({
    mutationFn: async (data: AccountFormData) => {
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

      const { error } = await supabase
        .from("bookkeeping_accounts")
        .insert(payload);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookkeeping-accounts"] });
      toast.success("Account created");
      reset();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to create account", {
        description: error.message,
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Account</DialogTitle>
          <DialogDescription>
            Add a new account to the chart of accounts
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Account Code</Label>
              <Input
                id="code"
                placeholder="e.g. 4000"
                {...register("code", { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Account Name</Label>
              <Input
                id="name"
                placeholder="e.g. Sales Revenue"
                {...register("name", { required: true })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select
                value={accountType}
                onValueChange={(value) => {
                  setValue("account_type", value);
                  // Reset subtype when type changes
                  const subtypes = ACCOUNT_SUBTYPES[value];
                  if (subtypes && subtypes.length > 0) {
                    setValue("account_subtype", subtypes[0]);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Subtype</Label>
              <Select
                value={watch("account_subtype")}
                onValueChange={(value) => setValue("account_subtype", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(ACCOUNT_SUBTYPES[accountType] || []).map((subtype) => (
                    <SelectItem key={subtype} value={subtype}>
                      {subtype.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_bank_account"
                checked={watch("is_bank_account")}
                onCheckedChange={(checked) =>
                  setValue("is_bank_account", checked as boolean)
                }
              />
              <Label htmlFor="is_bank_account" className="font-normal">
                Bank account
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_control_account"
                checked={watch("is_control_account")}
                onCheckedChange={(checked) =>
                  setValue("is_control_account", checked as boolean)
                }
              />
              <Label htmlFor="is_control_account" className="font-normal">
                Control account
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
