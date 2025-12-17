import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { createInvoiceDraftSafe, updateInvoiceDraftSafe, type InvoiceLineInput } from "@/lib/invoice-draft-service";
import { issueInvoiceSafe } from "@/lib/invoice-safe-service";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, FileCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { CustomerSelector } from "./CustomerSelector";
import { CreateCustomerDialog } from "./CreateCustomerDialog";
import { useInvoiceDraft } from "@/hooks/useInvoiceDraft";

interface InvoiceEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity;
  invoiceType: "SALES" | "PURCHASE";
  invoice?: any;
}

interface InvoiceFormData {
  contact_name: string;
  invoice_number: string;
  reference: string;
  issue_date: string;
  due_date: string;
  notes: string;
}

interface InvoiceLine {
  id?: string;
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  account_id: string;
  vat_code_id: string;
  vat_rate: number;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
}

export function InvoiceEditorDialog({
  open,
  onOpenChange,
  entity,
  invoiceType,
  invoice,
}: InvoiceEditorDialogProps) {
  const [lines, setLines] = useState<InvoiceLine[]>([
    {
      line_number: 1,
      description: "",
      quantity: 1,
      unit_price: 0,
      account_id: "",
      vat_code_id: "",
      vat_rate: 0,
      net_amount: 0,
      vat_amount: 0,
      gross_amount: 0,
    },
  ]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { draft, saveDraft, clearDraft, isLoaded } = useInvoiceDraft();
  
  const { register, handleSubmit, watch, setValue, reset } = useForm<InvoiceFormData>({
    defaultValues: invoice || {
      contact_name: "",
      invoice_number: "",
      reference: "",
      issue_date: new Date().toISOString().split("T")[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      notes: "",
    },
  });

  // Check if invoice is editable (only DRAFT status)
  const isDraft = !invoice || invoice.status === 'DRAFT';
  const isLocked = invoice && invoice.status !== 'DRAFT';

  const { data: accounts } = useQuery({
    queryKey: ["bookkeeping-accounts-invoice", organization?.id, entity.type, entity.id],
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

  // Track contact_email separately since form doesn't include it
  const [contactEmail, setContactEmail] = useState<string>("");

  // Restore draft on open
  useEffect(() => {
    if (open && !invoice && isLoaded && draft) {
      reset({
        contact_name: draft.contact_name,
        invoice_number: draft.invoice_number,
        reference: draft.reference,
        issue_date: draft.issue_date,
        due_date: draft.due_date,
        notes: draft.notes,
      });
      setLines(draft.lines);
      setSelectedCustomerId(draft.customer_id || null);
      setContactEmail(draft.contact_email || "");
    }
  }, [open, invoice, isLoaded, draft, reset]);

  // Load existing invoice lines if editing
  useEffect(() => {
    if (invoice?.id && open) {
      supabase
        .from("invoice_lines")
        .select("*")
        .eq("invoice_id", invoice.id)
        .order("line_number")
        .then(({ data }) => {
          if (data && data.length > 0) {
            setLines(data);
          }
        });
      setSelectedCustomerId(invoice.customer_id || null);
      setContactEmail(invoice.contact_email || "");
    } else if (open && !invoice && !draft) {
      setLines([
        {
          line_number: 1,
          description: "",
          quantity: 1,
          unit_price: 0,
          account_id: "",
          vat_code_id: "",
          vat_rate: 0,
          net_amount: 0,
          vat_amount: 0,
          gross_amount: 0,
        },
      ]);
      setContactEmail("");
    }
  }, [invoice, open, draft]);

  // Save draft when form changes (for new invoices only)
  const formValues = watch();
  useEffect(() => {
    if (open && !invoice && isDraft) {
      saveDraft({
        contact_name: formValues.contact_name,
        contact_email: contactEmail,
        invoice_number: formValues.invoice_number,
        reference: formValues.reference,
        issue_date: formValues.issue_date,
        due_date: formValues.due_date,
        notes: formValues.notes,
        customer_id: selectedCustomerId || "",
        lines,
        entity: entity ? { type: entity.type, id: entity.id } : null,
        invoiceType: "SALES",
      });
    }
  }, [formValues, lines, selectedCustomerId, contactEmail, open, invoice, isDraft, saveDraft]);

  const updateLine = (index: number, field: keyof InvoiceLine, value: any) => {
    if (isLocked) return;
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };

    // Recalculate amounts
    const line = newLines[index];
    const netAmount = line.quantity * line.unit_price;
    const vatAmount = netAmount * (line.vat_rate / 100);
    const grossAmount = netAmount + vatAmount;

    newLines[index] = {
      ...line,
      net_amount: netAmount,
      vat_amount: vatAmount,
      gross_amount: grossAmount,
    };

    setLines(newLines);
  };

  const addLine = () => {
    if (isLocked) return;
    setLines([
      ...lines,
      {
        line_number: lines.length + 1,
        description: "",
        quantity: 1,
        unit_price: 0,
        account_id: "",
        vat_code_id: "",
        vat_rate: 0,
        net_amount: 0,
        vat_amount: 0,
        gross_amount: 0,
      },
    ]);
  };

  const removeLine = (index: number) => {
    if (isLocked) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const totals = lines.reduce(
    (acc, line) => ({
      net: acc.net + line.net_amount,
      vat: acc.vat + line.vat_amount,
      gross: acc.gross + line.gross_amount,
    }),
    { net: 0, vat: 0, gross: 0 }
  );

  const saveMutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      if (!organization?.id) throw new Error("No organization");

      const lineInputs: InvoiceLineInput[] = lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        account_id: line.account_id || undefined,
        vat_code_id: line.vat_code_id || undefined,
        vat_rate: line.vat_rate,
        net_amount: line.net_amount,
        vat_amount: line.vat_amount,
        gross_amount: line.gross_amount,
      }));

      if (invoice?.id) {
        // Update existing draft
        const result = await updateInvoiceDraftSafe(invoice.id, {
          contactName: data.contact_name,
          contactEmail: contactEmail || undefined,
          reference: data.reference,
          issueDate: data.issue_date,
          dueDate: data.due_date,
          notes: data.notes,
          customerId: selectedCustomerId || undefined,
          lines: lineInputs,
        });
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to update invoice');
        }
      } else {
        // Create new draft
        const result = await createInvoiceDraftSafe(organization.id, {
          entityType: entity.type,
          entityId: entity.id,
          invoiceType,
          contactName: data.contact_name,
          contactEmail: contactEmail || undefined,
          invoiceNumber: data.invoice_number || undefined,
          reference: data.reference || undefined,
          issueDate: data.issue_date,
          dueDate: data.due_date,
          notes: data.notes || undefined,
          customerId: selectedCustomerId || undefined,
          lines: lineInputs,
        });
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to create invoice');
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(invoice ? "Invoice updated" : "Invoice created");
      clearDraft();
      reset();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to save invoice", {
        description: error.message,
      });
    },
  });

  const issueMutation = useMutation({
    mutationFn: async () => {
      if (!invoice?.id) throw new Error("No invoice to issue");
      const result = await issueInvoiceSafe(invoice.id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to issue invoice');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
      toast.success("Invoice issued and posted to ledger");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to issue invoice", {
        description: error.message,
      });
    },
  });

  const handleCustomerCreated = (customer: { id: string; name: string; email?: string }) => {
    setSelectedCustomerId(customer.id);
    setValue("contact_name", customer.name);
    setContactEmail(customer.email || "");
    setCreateCustomerOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {invoice ? (isLocked ? "View" : "Edit") : "New"} {invoiceType === "SALES" ? "Sales" : "Purchase"} Invoice
            </DialogTitle>
            <DialogDescription>
              {invoice?.invoice_number || "Create a new invoice"}
              {isLocked && <span className="ml-2 text-amber-600">(Locked - {invoice.status})</span>}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer">
                  {invoiceType === "SALES" ? "Customer" : "Supplier"}
                </Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <CustomerSelector
                      entity={entity}
                      value={selectedCustomerId}
                      onSelect={(customer) => {
                        setSelectedCustomerId(customer?.id || null);
                        if (customer) {
                          setValue("contact_name", customer.name);
                          setContactEmail(customer.email || "");
                        } else {
                          setContactEmail("");
                        }
                      }}
                      onCreateNew={() => setCreateCustomerOpen(true)}
                      disabled={isLocked}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCreateCustomerOpen(true)}
                    disabled={isLocked}
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoice_number">Invoice Number</Label>
                <Input id="invoice_number" {...register("invoice_number")} disabled={isLocked} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reference">Reference</Label>
                <Input id="reference" {...register("reference")} disabled={isLocked} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="issue_date">Issue Date</Label>
                <Input
                  id="issue_date"
                  type="date"
                  {...register("issue_date", { required: true })}
                  disabled={isLocked}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  {...register("due_date", { required: true })}
                  disabled={isLocked}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Invoice Lines</Label>
                {isDraft && (
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Line
                  </Button>
                )}
              </div>

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-20">Qty</TableHead>
                      <TableHead className="w-24">Price</TableHead>
                      <TableHead className="w-32">Account</TableHead>
                      <TableHead className="w-24">VAT</TableHead>
                      <TableHead className="w-24 text-right">Total</TableHead>
                      {isDraft && <TableHead className="w-12"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Input
                            value={line.description}
                            onChange={(e) => updateLine(idx, "description", e.target.value)}
                            placeholder="Item description"
                            disabled={isLocked}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(idx, "quantity", parseFloat(e.target.value) || 0)
                            }
                            disabled={isLocked}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={line.unit_price}
                            onChange={(e) =>
                              updateLine(idx, "unit_price", parseFloat(e.target.value) || 0)
                            }
                            disabled={isLocked}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={line.account_id}
                            onValueChange={(value) => updateLine(idx, "account_id", value)}
                            disabled={isLocked}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts?.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.code}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={line.vat_code_id}
                            onValueChange={(value) => {
                              const vatCode = vatCodes?.find((v) => v.id === value);
                              updateLine(idx, "vat_code_id", value);
                              if (vatCode) {
                                updateLine(idx, "vat_rate", vatCode.rate);
                              }
                            }}
                            disabled={isLocked}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="VAT" />
                            </SelectTrigger>
                            <SelectContent>
                              {vatCodes?.map((vat) => (
                                <SelectItem key={vat.id} value={vat.id}>
                                  {vat.code}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(line.gross_amount)}
                        </TableCell>
                        {isDraft && (
                          <TableCell>
                            {lines.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeLine(idx)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="w-48 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Net:</span>
                  <span>{formatCurrency(totals.net)}</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT:</span>
                  <span>{formatCurrency(totals.vat)}</span>
                </div>
                <div className="flex justify-between font-medium border-t pt-1">
                  <span>Total:</span>
                  <span>{formatCurrency(totals.gross)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" {...register("notes")} rows={3} disabled={isLocked} />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {isLocked ? "Close" : "Cancel"}
              </Button>
              {isDraft && (
                <>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Saving..." : "Save Draft"}
                  </Button>
                  {invoice?.id && (
                    <Button
                      type="button"
                      onClick={() => issueMutation.mutate()}
                      disabled={issueMutation.isPending}
                    >
                      <FileCheck className="h-4 w-4 mr-2" />
                      {issueMutation.isPending ? "Issuing..." : "Issue Invoice"}
                    </Button>
                  )}
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CreateCustomerDialog
        open={createCustomerOpen}
        onOpenChange={setCreateCustomerOpen}
        entity={entity}
        onCreated={handleCustomerCreated}
      />
    </>
  );
}
