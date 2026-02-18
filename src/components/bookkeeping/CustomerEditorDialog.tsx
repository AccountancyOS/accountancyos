import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getVatCodeLabel } from "@/lib/vat-code-utils";

interface CustomerEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: any | null;
  entity: { type: "client" | "company"; id: string };
  onSuccess: () => void;
}

interface FormData {
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  country: string;
  vatNumber: string;
  defaultAccountId: string;
  defaultVatCodeId: string;
  paymentTermsDays: number;
  notes: string;
  isActive: boolean;
}

export default function CustomerEditorDialog({
  open,
  onOpenChange,
  customer,
  entity,
  onSuccess,
}: CustomerEditorDialogProps) {
  const { organization } = useOrganization();
  const isEditing = !!customer;

  const { register, handleSubmit, reset, setValue, watch } = useForm<FormData>({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      postcode: "",
      country: "United Kingdom",
      vatNumber: "",
      defaultAccountId: "",
      defaultVatCodeId: "",
      paymentTermsDays: 30,
      notes: "",
      isActive: true,
    },
  });

  // Fetch accounts for dropdown
  const { data: accounts } = useQuery({
    queryKey: ["accounts-income", entity?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data } = await supabase
        .from("bookkeeping_accounts")
        .select("id, code, name")
        .eq("organization_id", organization.id)
        .eq(entity.type === "company" ? "company_id" : "client_id", entity.id)
        .eq("account_type", "INCOME")
        .eq("is_active", true)
        .order("code");
      return data || [];
    },
    enabled: open && !!organization?.id,
  });

  // Fetch VAT codes for dropdown
  const { data: vatCodes } = useQuery({
    queryKey: ["vat-codes", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data } = await (supabase
        .from("vat_codes") as any)
        .select("id, code, description, rate, is_common")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("code");
      return data || [];
    },
    enabled: open && !!organization?.id,
  });

  const [showAllVatCodes, setShowAllVatCodes] = useState(false);

  const filteredVatCodes = useMemo(() => {
    if (!vatCodes) return [];
    return showAllVatCodes ? vatCodes : vatCodes.filter((v: any) => v.is_common);
  }, [vatCodes, showAllVatCodes]);

  useEffect(() => {
    if (customer) {
      reset({
        name: customer.name || "",
        email: customer.email || "",
        phone: customer.phone || "",
        addressLine1: customer.address_line_1 || "",
        addressLine2: customer.address_line_2 || "",
        city: customer.city || "",
        postcode: customer.postcode || "",
        country: customer.country || "United Kingdom",
        vatNumber: customer.vat_number || "",
        defaultAccountId: customer.default_account_id || "",
        defaultVatCodeId: customer.default_vat_code_id || "",
        paymentTermsDays: customer.payment_terms_days || 30,
        notes: customer.notes || "",
        isActive: customer.is_active ?? true,
      });
    } else {
      reset({
        name: "",
        email: "",
        phone: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        postcode: "",
        country: "United Kingdom",
        vatNumber: "",
        defaultAccountId: "",
        defaultVatCodeId: "",
        paymentTermsDays: 30,
        notes: "",
        isActive: true,
      });
    }
  }, [customer, reset]);

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        organization_id: organization?.id,
        client_id: entity.type === "client" ? entity.id : null,
        company_id: entity.type === "company" ? entity.id : null,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        address_line_1: data.addressLine1 || null,
        address_line_2: data.addressLine2 || null,
        city: data.city || null,
        postcode: data.postcode || null,
        country: data.country || null,
        vat_number: data.vatNumber || null,
        default_account_id: data.defaultAccountId || null,
        default_vat_code_id: data.defaultVatCodeId || null,
        payment_terms_days: data.paymentTermsDays,
        notes: data.notes || null,
        is_active: data.isActive,
      };

      if (isEditing) {
        const { error } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", customer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? "Customer updated" : "Customer created");
      onSuccess();
    },
    onError: (error: any) => {
      toast.error("Failed to save customer: " + error.message);
    },
  });

  const onSubmit = (data: FormData) => {
    saveMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Customer" : "New Customer"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" {...register("name", { required: true })} />
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...register("phone")} />
            </div>

            <div className="col-span-2">
              <Label htmlFor="addressLine1">Address Line 1</Label>
              <Input id="addressLine1" {...register("addressLine1")} />
            </div>

            <div className="col-span-2">
              <Label htmlFor="addressLine2">Address Line 2</Label>
              <Input id="addressLine2" {...register("addressLine2")} />
            </div>

            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" {...register("city")} />
            </div>

            <div>
              <Label htmlFor="postcode">Postcode</Label>
              <Input id="postcode" {...register("postcode")} />
            </div>

            <div>
              <Label htmlFor="country">Country</Label>
              <Input id="country" {...register("country")} />
            </div>

            <div>
              <Label htmlFor="vatNumber">VAT Number</Label>
              <Input id="vatNumber" {...register("vatNumber")} />
            </div>

            <div>
              <Label htmlFor="defaultAccountId">Default Sales Account</Label>
              <Select
                value={watch("defaultAccountId")}
                onValueChange={(val) => setValue("defaultAccountId", val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {accounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="defaultVatCodeId">Default VAT Code</Label>
              <Select
                value={watch("defaultVatCodeId")}
                onValueChange={(val) => setValue("defaultVatCodeId", val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select VAT code" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {(() => {
                    const selectedId = watch("defaultVatCodeId");
                    const selectedVat = vatCodes?.find((v: any) => v.id === selectedId);
                    const opts = selectedVat && !filteredVatCodes.some((v: any) => v.id === selectedVat.id)
                      ? [selectedVat, ...filteredVatCodes]
                      : filteredVatCodes;
                    return opts.map((vat: any) => (
                      <SelectItem key={vat.id} value={vat.id}>
                        {getVatCodeLabel(vat)}
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline cursor-pointer mt-1"
                onClick={() => setShowAllVatCodes((v) => !v)}
              >
                {showAllVatCodes ? "Show common only" : "Show all codes"}
              </button>
            </div>

            <div>
              <Label htmlFor="paymentTermsDays">Payment Terms (days)</Label>
              <Input
                id="paymentTermsDays"
                type="number"
                {...register("paymentTermsDays", { valueAsNumber: true })}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="isActive"
                checked={watch("isActive")}
                onCheckedChange={(checked) => setValue("isActive", checked)}
              />
              <Label htmlFor="isActive">Active</Label>
            </div>

            <div className="col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" {...register("notes")} rows={3} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
