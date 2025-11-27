import { useState, useEffect } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, FileCheck } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/bookkeeping-utils";

interface InvoiceEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity;
  invoiceType: "SALES" | "PURCHASE";
  invoice?: any;
}

interface InvoiceFormData {
  contact_name: string;
  contact_email: string;
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
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { register, handleSubmit, watch, setValue, reset } = useForm<InvoiceFormData>({
    defaultValues: invoice || {
      contact_name: "",
      contact_email: "",
      invoice_number: "",
      reference: "",
      issue_date: new Date().toISOString().split("T")[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      notes: "",
    },
  });

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
    } else if (open) {
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
    }
  }, [invoice, open]);

  const updateLine = (index: number, field: keyof InvoiceLine, value: any) => {
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

      const invoiceData: any = {
        organization_id: organization.id,
        client_id: entity.type === "client" ? entity.id : null,
        company_id: entity.type === "company" ? entity.id : null,
        invoice_type: invoiceType,
        ...data,
      };

      let invoiceId = invoice?.id;

      if (invoice?.id) {
        const { error } = await supabase
          .from("invoices")
          .update(invoiceData)
          .eq("id", invoice.id);
        if (error) throw error;
      } else {
        const { data: newInvoice, error } = await supabase
          .from("invoices")
          .insert(invoiceData)
          .select()
          .single();
        if (error) throw error;
        invoiceId = newInvoice.id;
      }

      // Delete existing lines and insert new ones
      if (invoice?.id) {
        await supabase.from("invoice_lines").delete().eq("invoice_id", invoiceId);
      }

      const linesData = lines.map((line, idx) => ({
        invoice_id: invoiceId,
        line_number: idx + 1,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        account_id: line.account_id,
        vat_code_id: line.vat_code_id || null,
        vat_rate: line.vat_rate,
        net_amount: line.net_amount,
        vat_amount: line.vat_amount,
        gross_amount: line.gross_amount,
      }));

      const { error: linesError } = await supabase
        .from("invoice_lines")
        .insert(linesData);

      if (linesError) throw linesError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(invoice ? "Invoice updated" : "Invoice created");
      reset();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to save invoice", {
        description: error.message,
      });
    },
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!invoice?.id || !organization?.id) throw new Error("No invoice");

      // Create ledger entries for each line
      const ledgerEntries = lines.map((line) => {
        const isIncome = invoiceType === "SALES";
        return {
          organization_id: organization.id,
          client_id: entity.type === "client" ? entity.id : null,
          company_id: entity.type === "company" ? entity.id : null,
          transaction_date: watch("issue_date"),
          account_id: line.account_id,
          debit: isIncome ? null : line.net_amount,
          credit: isIncome ? line.net_amount : null,
          vat_code_id: line.vat_code_id || null,
          description: `${invoiceType} Invoice ${watch("invoice_number")}: ${line.description}`,
          source_type: "INVOICE",
          source_id: invoice.id,
          created_by: user?.id,
        };
      });

      // Add VAT entries if applicable
      const vatEntry = {
        organization_id: organization.id,
        client_id: entity.type === "client" ? entity.id : null,
        company_id: entity.type === "company" ? entity.id : null,
        transaction_date: watch("issue_date"),
        account_id: accounts?.find((a) => a.is_control_account && a.name.includes("VAT"))?.id,
        debit: invoiceType === "SALES" ? null : totals.vat,
        credit: invoiceType === "SALES" ? totals.vat : null,
        vat_code_id: null,
        description: `${invoiceType} Invoice ${watch("invoice_number")} - VAT`,
        source_type: "INVOICE",
        source_id: invoice.id,
        created_by: user?.id,
      };

      if (totals.vat > 0 && vatEntry.account_id) {
        ledgerEntries.push(vatEntry);
      }

      // Add AR/AP entry
      const controlAccountType = invoiceType === "SALES" ? "Trade Debtors" : "Trade Creditors";
      const controlAccount = accounts?.find(
        (a) => a.is_control_account && a.name.includes(controlAccountType)
      );

      if (controlAccount) {
        ledgerEntries.push({
          organization_id: organization.id,
          client_id: entity.type === "client" ? entity.id : null,
          company_id: entity.type === "company" ? entity.id : null,
          transaction_date: watch("issue_date"),
          account_id: controlAccount.id,
          debit: invoiceType === "SALES" ? totals.gross : null,
          credit: invoiceType === "PURCHASE" ? totals.gross : null,
          vat_code_id: null,
          description: `${invoiceType} Invoice ${watch("invoice_number")}: ${watch("contact_name")}`,
          source_type: "INVOICE",
          source_id: invoice.id,
          created_by: user?.id,
        });
      }

      const { error: ledgerError } = await supabase
        .from("ledger_entries")
        .insert(ledgerEntries);

      if (ledgerError) throw ledgerError;

      // Mark invoice as posted
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          is_posted: true,
          posted_at: new Date().toISOString(),
          posted_by: user?.id,
          status: "AWAITING_PAYMENT",
        })
        .eq("id", invoice.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
      toast.success("Invoice posted to ledger");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to post invoice", {
        description: error.message,
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {invoice ? "Edit" : "New"} {invoiceType === "SALES" ? "Sales" : "Purchase"} Invoice
          </DialogTitle>
          <DialogDescription>
            {invoice?.invoice_number || "Create a new invoice"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_name">
                {invoiceType === "SALES" ? "Customer" : "Supplier"} Name
              </Label>
              <Input
                id="contact_name"
                {...register("contact_name", { required: true })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_email">Email</Label>
              <Input id="contact_email" type="email" {...register("contact_email")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice_number">Invoice Number</Label>
              <Input id="invoice_number" {...register("invoice_number")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input id="reference" {...register("reference")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="issue_date">Issue Date</Label>
              <Input
                id="issue_date"
                type="date"
                {...register("issue_date", { required: true })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                type="date"
                {...register("due_date", { required: true })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Invoice Lines</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" />
                Add Line
              </Button>
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
                    <TableHead className="w-12"></TableHead>
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
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={line.account_id}
                          onValueChange={(value) => updateLine(idx, "account_id", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Account" />
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
                            updateLine(idx, "vat_rate", vatCode?.rate || 0);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="VAT" />
                          </SelectTrigger>
                          <SelectContent>
                            {vatCodes?.map((code) => (
                              <SelectItem key={code.id} value={code.id}>
                                {code.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(line.gross_amount)}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLine(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Net Total:</span>
                  <span className="font-mono">{formatCurrency(totals.net)}</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT:</span>
                  <span className="font-mono">{formatCurrency(totals.vat)}</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t pt-2">
                  <span>Gross Total:</span>
                  <span className="font-mono">{formatCurrency(totals.gross)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} rows={3} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {invoice?.id && !invoice.is_posted && (
              <Button
                type="button"
                variant="default"
                onClick={() => postMutation.mutate()}
                disabled={postMutation.isPending}
              >
                <FileCheck className="h-4 w-4 mr-2" />
                Post to Ledger
              </Button>
            )}
            <Button type="submit" disabled={saveMutation.isPending || invoice?.is_posted}>
              {saveMutation.isPending ? "Saving..." : "Save Invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
