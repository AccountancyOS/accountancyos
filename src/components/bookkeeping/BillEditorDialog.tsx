import { useEffect, useState, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import { createBillDraftSafe, updateBillDraftSafe } from "@/lib/bill-draft-service";
import { approveBill } from "@/lib/bills-service";
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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addDays, format } from "date-fns";
import { getVatCodeLabel } from "@/lib/vat-code-utils";

interface BillEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill: any | null;
  entity: { type: "client" | "company"; id: string };
  onSuccess: () => void;
}

interface LineItem {
  description: string;
  accountId: string;
  vatCodeId: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

interface FormData {
  supplierId: string;
  billNumber: string;
  reference: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  notes: string;
  lines: LineItem[];
}

export default function BillEditorDialog({
  open,
  onOpenChange,
  bill,
  entity,
  onSuccess,
}: BillEditorDialogProps) {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!bill;
  const isDraft = !bill || bill.status === "DRAFT";

  const { register, handleSubmit, reset, setValue, watch, control } = useForm<FormData>({
    defaultValues: {
      supplierId: "",
      billNumber: "",
      reference: "",
      issueDate: format(new Date(), "yyyy-MM-dd"),
      dueDate: format(addDays(new Date(), 30), "yyyy-MM-dd"),
      currency: "GBP",
      notes: "",
      lines: [{ description: "", accountId: "", vatCodeId: "", quantity: 1, unitPrice: 0, vatRate: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  });

  // Fetch suppliers
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-for-bill", entity?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name, default_account_id, default_vat_code_id, payment_terms_days")
        .eq(entity.type === "company" ? "company_id" : "client_id", entity.id)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: open && !!entity,
  });

  // Fetch accounts
  const { data: accounts } = useQuery({
    queryKey: ["accounts-expense-for-bill", entity?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data } = await supabase
        .from("bookkeeping_accounts")
        .select("id, code, name")
        .eq("organization_id", organization.id)
        .eq(entity.type === "company" ? "company_id" : "client_id", entity.id)
        .in("account_type", ["EXPENSE", "ASSET"])
        .eq("is_active", true)
        .order("code");
      return data || [];
    },
    enabled: open && !!organization?.id,
  });

  // Fetch VAT codes
  const { data: vatCodes } = useQuery({
    queryKey: ["vat-codes-for-bill", organization?.id],
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

  // Fetch bill lines if editing
  const { data: billLines } = useQuery({
    queryKey: ["bill-lines", bill?.id],
    queryFn: async () => {
      if (!bill?.id) return [];
      const { data } = await supabase
        .from("bill_lines")
        .select("*")
        .eq("bill_id", bill.id)
        .order("line_number");
      return data || [];
    },
    enabled: open && !!bill?.id,
  });

  useEffect(() => {
    if (bill && billLines) {
      reset({
        supplierId: bill.supplier_id || "",
        billNumber: bill.bill_number || "",
        reference: bill.reference || "",
        issueDate: bill.issue_date || format(new Date(), "yyyy-MM-dd"),
        dueDate: bill.due_date || format(addDays(new Date(), 30), "yyyy-MM-dd"),
        currency: bill.currency || "GBP",
        notes: bill.notes || "",
        lines: billLines.length > 0
          ? billLines.map((line) => ({
              description: line.description || "",
              accountId: line.account_id || "",
              vatCodeId: line.vat_code_id || "",
              quantity: line.quantity || 1,
              unitPrice: line.unit_price || 0,
              vatRate: line.vat_rate || 0,
            }))
          : [{ description: "", accountId: "", vatCodeId: "", quantity: 1, unitPrice: 0, vatRate: 0 }],
      });
    } else if (!bill) {
      reset({
        supplierId: "",
        billNumber: "",
        reference: "",
        issueDate: format(new Date(), "yyyy-MM-dd"),
        dueDate: format(addDays(new Date(), 30), "yyyy-MM-dd"),
        currency: "GBP",
        notes: "",
        lines: [{ description: "", accountId: "", vatCodeId: "", quantity: 1, unitPrice: 0, vatRate: 0 }],
      });
    }
  }, [bill, billLines, reset]);

  // Handle supplier change - update defaults
  const handleSupplierChange = (supplierId: string) => {
    setValue("supplierId", supplierId);
    const supplier = suppliers?.find((s) => s.id === supplierId);
    if (supplier) {
      if (supplier.payment_terms_days) {
        const issueDate = watch("issueDate");
        const due = addDays(new Date(issueDate), supplier.payment_terms_days);
        setValue("dueDate", format(due, "yyyy-MM-dd"));
      }
    }
  };

  // Handle VAT code change - update rate
  const handleVatCodeChange = (index: number, vatCodeId: string) => {
    const vatCode = vatCodes?.find((v: any) => v.id === vatCodeId);
    setValue(`lines.${index}.vatCodeId`, vatCodeId);
    setValue(`lines.${index}.vatRate`, vatCode?.rate || 0);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const billLines = data.lines.map((line) => ({
        description: line.description || '',
        quantity: line.quantity,
        unit_price: line.unitPrice,
        vat_rate: line.vatRate,
        account_id: line.accountId || '',
        vat_code_id: line.vatCodeId || '',
      }));

      if (isEditing) {
        const result = await updateBillDraftSafe(bill.id, {
          supplierId: data.supplierId,
          billNumber: data.billNumber || undefined,
          reference: data.reference || undefined,
          issueDate: data.issueDate,
          dueDate: data.dueDate,
          notes: data.notes || undefined,
          lines: billLines,
        });
        if (!result.success) throw new Error(result.error);
      } else {
        const result = await createBillDraftSafe(
          organization!.id,
          {
            entityType: entity.type,
            entityId: entity.id,
            supplierId: data.supplierId,
            billNumber: data.billNumber || undefined,
            reference: data.reference || undefined,
            issueDate: data.issueDate,
            dueDate: data.dueDate,
            currency: data.currency,
            notes: data.notes || undefined,
            lines: billLines,
          }
        );
        if (!result.success) throw new Error(result.error);
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? "Bill updated" : "Bill created");
      onSuccess();
    },
    onError: (error: any) => {
      toast.error("Failed to save bill: " + error.message);
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!bill?.id || !user?.id) throw new Error("Missing data");
      const result = await approveBill(bill.id, user.id);
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      toast.success("Bill approved and posted to ledger");
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      onSuccess();
    },
    onError: (error: any) => {
      toast.error("Failed to approve bill: " + error.message);
    },
  });

  const onSubmit = (data: FormData) => {
    saveMutation.mutate(data);
  };

  const lines = watch("lines");
  const totals = lines.reduce(
    (acc, line) => {
      const net = (line.quantity || 0) * (line.unitPrice || 0);
      const vat = net * ((line.vatRate || 0) / 100);
      return {
        net: acc.net + net,
        vat: acc.vat + vat,
        gross: acc.gross + net + vat,
      };
    },
    { net: 0, vat: 0, gross: 0 }
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? (isDraft ? "Edit Bill" : "View Bill") : "New Bill"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Supplier *</Label>
              <Select
                value={watch("supplierId")}
                onValueChange={handleSupplierChange}
                disabled={!isDraft}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers?.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Bill Number</Label>
              <Input {...register("billNumber")} disabled={!isDraft} />
            </div>

            <div>
              <Label>Reference</Label>
              <Input {...register("reference")} disabled={!isDraft} />
            </div>

            <div>
              <Label>Issue Date *</Label>
              <Input type="date" {...register("issueDate")} disabled={!isDraft} />
            </div>

            <div>
              <Label>Due Date *</Label>
              <Input type="date" {...register("dueDate")} disabled={!isDraft} />
            </div>

            <div>
              <Label>Currency</Label>
              <Select
                value={watch("currency")}
                onValueChange={(val) => setValue("currency", val)}
                disabled={!isDraft}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline cursor-pointer"
                onClick={() => setShowAllVatCodes((v) => !v)}
              >
                {showAllVatCodes ? "Show common VAT only" : "Show all VAT codes"}
              </button>
            </div>
            <div className="border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Description</th>
                    <th className="p-2 text-left w-40">Account</th>
                    <th className="p-2 text-left w-32">VAT</th>
                    <th className="p-2 text-right w-20">Qty</th>
                    <th className="p-2 text-right w-24">Price</th>
                    <th className="p-2 text-right w-24">Total</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, index) => {
                    const line = lines[index];
                    const lineTotal = (line?.quantity || 0) * (line?.unitPrice || 0);
                    return (
                      <tr key={field.id} className="border-t">
                        <td className="p-2">
                          <Input
                            {...register(`lines.${index}.description`)}
                            placeholder="Description"
                            disabled={!isDraft}
                          />
                        </td>
                        <td className="p-2">
                          <Select
                            value={line?.accountId || ""}
                            onValueChange={(val) => setValue(`lines.${index}.accountId`, val)}
                            disabled={!isDraft}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Account" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts?.map((acc) => (
                                <SelectItem key={acc.id} value={acc.id}>
                                  {acc.code}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <Select
                            value={line?.vatCodeId || ""}
                            onValueChange={(val) => handleVatCodeChange(index, val)}
                            disabled={!isDraft}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="VAT" />
                            </SelectTrigger>
                            <SelectContent>
                              {(() => {
                                const selectedVat = vatCodes?.find((v: any) => v.id === (line?.vatCodeId || ""));
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
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
                            className="text-right"
                            disabled={!isDraft}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            step="0.01"
                            {...register(`lines.${index}.unitPrice`, { valueAsNumber: true })}
                            className="text-right"
                            disabled={!isDraft}
                          />
                        </td>
                        <td className="p-2 text-right font-medium">
                          £{lineTotal.toFixed(2)}
                        </td>
                        <td className="p-2">
                          {isDraft && fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {isDraft && (
                <div className="p-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      append({ description: "", accountId: "", vatCodeId: "", quantity: 1, unitPrice: 0, vatRate: 0 })
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Line
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-48 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Net:</span>
                <span>£{totals.net.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>VAT:</span>
                <span>£{totals.vat.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium text-base border-t pt-1">
                <span>Total:</span>
                <span>£{totals.gross.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea {...register("notes")} rows={2} disabled={!isDraft} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {isDraft ? "Cancel" : "Close"}
            </Button>
            {isDraft && (
              <>
                <Button type="submit" variant="outline" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : "Save Draft"}
                </Button>
                {isEditing && (
                  <Button
                    type="button"
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending}
                  >
                    {approveMutation.isPending ? "Approving..." : "Approve & Post"}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
