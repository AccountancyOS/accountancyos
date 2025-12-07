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
import { formatCurrency } from "@/lib/bookkeeping-utils";

interface CreditNoteEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity;
  creditNoteType: "sales" | "purchase";
  creditNote?: any;
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  accountId: string;
  vatCodeId: string;
  vatRate: number;
}

export function CreditNoteEditorDialog({
  open,
  onOpenChange,
  entity,
  creditNoteType,
  creditNote,
}: CreditNoteEditorDialogProps) {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [creditNoteNumber, setCreditNoteNumber] = useState("");
  const [creditNoteDate, setCreditNoteDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [originalInvoiceId, setOriginalInvoiceId] = useState("");
  const [originalBillId, setOriginalBillId] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([
    {
      id: crypto.randomUUID(),
      description: "",
      quantity: 1,
      unitPrice: 0,
      accountId: "",
      vatCodeId: "",
      vatRate: 0,
    },
  ]);

  // Load existing credit note data
  useEffect(() => {
    if (creditNote) {
      setCreditNoteNumber(creditNote.credit_note_number || "");
      setCreditNoteDate(creditNote.credit_note_date || new Date().toISOString().split("T")[0]);
      setCustomerId(creditNote.customer_id || "");
      setSupplierId(creditNote.supplier_id || "");
      setOriginalInvoiceId(creditNote.original_invoice_id || "");
      setOriginalBillId(creditNote.original_bill_id || "");
      setCurrency(creditNote.currency || "GBP");
      setNotes(creditNote.notes || "");
      // Load lines if they exist
    } else {
      // Reset form
      setCreditNoteNumber("");
      setCreditNoteDate(new Date().toISOString().split("T")[0]);
      setCustomerId("");
      setSupplierId("");
      setOriginalInvoiceId("");
      setOriginalBillId("");
      setCurrency("GBP");
      setNotes("");
      setLines([
        {
          id: crypto.randomUUID(),
          description: "",
          quantity: 1,
          unitPrice: 0,
          accountId: "",
          vatCodeId: "",
          vatRate: 0,
        },
      ]);
    }
  }, [creditNote, open]);

  // Fetch customers/suppliers based on type
  const { data: customers } = useQuery({
    queryKey: ["customers", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const query = supabase
        .from("customers")
        .select("id, name")
        .eq("organization_id", organization.id)
        .eq("is_active", true);

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data } = await query.order("name");
      return data || [];
    },
    enabled: !!organization?.id && creditNoteType === "sales",
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const query = supabase
        .from("suppliers")
        .select("id, name")
        .eq("organization_id", organization.id)
        .eq("is_active", true);

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data } = await query.order("name");
      return data || [];
    },
    enabled: !!organization?.id && creditNoteType === "purchase",
  });

  // Fetch accounts for line items
  const { data: accounts } = useQuery({
    queryKey: ["accounts-for-cn", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const query = supabase
        .from("bookkeeping_accounts")
        .select("id, code, name, account_type")
        .eq("organization_id", organization.id)
        .eq("is_active", true);

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data } = await query.order("code");
      return data || [];
    },
    enabled: !!organization?.id,
  });

  // Fetch VAT codes
  const { data: vatCodes } = useQuery({
    queryKey: ["vat-codes", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data } = await supabase
        .from("vat_codes")
        .select("id, code, description, rate")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("code");
      return data || [];
    },
    enabled: !!organization?.id,
  });

  // Calculate totals
  const calculateLineTotals = (line: LineItem) => {
    const net = line.quantity * line.unitPrice;
    const vat = net * (line.vatRate / 100);
    return { net, vat, gross: net + vat };
  };

  const totals = lines.reduce(
    (acc, line) => {
      const { net, vat, gross } = calculateLineTotals(line);
      return {
        net: acc.net + net,
        vat: acc.vat + vat,
        gross: acc.gross + gross,
      };
    },
    { net: 0, vat: 0, gross: 0 }
  );

  const addLine = () => {
    setLines([
      ...lines,
      {
        id: crypto.randomUUID(),
        description: "",
        quantity: 1,
        unitPrice: 0,
        accountId: "",
        vatCodeId: "",
        vatRate: 0,
      },
    ]);
  };

  const removeLine = (id: string) => {
    if (lines.length > 1) {
      setLines(lines.filter((l) => l.id !== id));
    }
  };

  const updateLine = (id: string, updates: Partial<LineItem>) => {
    setLines(
      lines.map((l) => {
        if (l.id === id) {
          const updated = { ...l, ...updates };
          // If VAT code changed, update rate
          if (updates.vatCodeId) {
            const vatCode = vatCodes?.find((v) => v.id === updates.vatCodeId);
            if (vatCode) {
              updated.vatRate = Number(vatCode.rate) || 0;
            }
          }
          return updated;
        }
        return l;
      })
    );
  };

  const saveMutation = useMutation({
    mutationFn: async (approve: boolean) => {
      if (!organization?.id) throw new Error("No organization");

      const creditNoteData = {
        organization_id: organization.id,
        client_id: entity.type === "client" ? entity.id : null,
        company_id: entity.type === "company" ? entity.id : null,
        credit_note_type: creditNoteType.toUpperCase(),
        credit_note_number: creditNoteNumber || null,
        credit_note_date: creditNoteDate,
        customer_id: creditNoteType === "sales" ? customerId || null : null,
        supplier_id: creditNoteType === "purchase" ? supplierId || null : null,
        original_invoice_id: creditNoteType === "sales" ? originalInvoiceId || null : null,
        original_bill_id: creditNoteType === "purchase" ? originalBillId || null : null,
        currency,
        notes: notes || null,
        total_net: totals.net,
        total_vat: totals.vat,
        total_gross: totals.gross,
        allocated_amount: 0,
        status: approve ? "APPROVED" : "DRAFT",
        is_posted: approve,
      };

      if (creditNote?.id) {
        // Update existing
        const { error } = await supabase
          .from("credit_notes")
          .update(creditNoteData)
          .eq("id", creditNote.id);
        if (error) throw error;

        // Delete and re-insert lines
        await supabase.from("credit_note_lines").delete().eq("credit_note_id", creditNote.id);
      } else {
        // Insert new
        const { data, error } = await supabase
          .from("credit_notes")
          .insert(creditNoteData)
          .select("id")
          .single();
        if (error) throw error;

        // Insert lines
        const lineData = lines.map((line, idx) => ({
          credit_note_id: data.id,
          line_number: idx + 1,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          account_id: line.accountId || null,
          vat_code_id: line.vatCodeId || null,
          vat_rate: line.vatRate,
          net_amount: line.quantity * line.unitPrice,
          vat_amount: line.quantity * line.unitPrice * (line.vatRate / 100),
          gross_amount: line.quantity * line.unitPrice * (1 + line.vatRate / 100),
        }));

        const { error: linesError } = await supabase.from("credit_note_lines").insert(lineData);
        if (linesError) throw linesError;
      }
    },
    onSuccess: (_, approve) => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      toast.success(approve ? "Credit note approved" : "Credit note saved as draft");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to save credit note", { description: error.message });
    },
  });

  const isEditable = !creditNote || creditNote.status === "DRAFT";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {creditNote ? "Edit" : "New"} {creditNoteType === "sales" ? "Sales" : "Purchase"} Credit Note
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header Fields */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Credit Note Number</Label>
              <Input
                value={creditNoteNumber}
                onChange={(e) => setCreditNoteNumber(e.target.value)}
                placeholder="Auto-generated if blank"
                disabled={!isEditable}
              />
            </div>

            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={creditNoteDate}
                onChange={(e) => setCreditNoteDate(e.target.value)}
                disabled={!isEditable}
              />
            </div>

            <div className="space-y-2">
              <Label>{creditNoteType === "sales" ? "Customer" : "Supplier"}</Label>
              {creditNoteType === "sales" ? (
                <Select value={customerId} onValueChange={setCustomerId} disabled={!isEditable}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={supplierId} onValueChange={setSupplierId} disabled={!isEditable}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency} disabled={!isEditable}>
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Line Items</Label>
              {isEditable && (
                <Button variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Line
                </Button>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Description</th>
                    <th className="text-right p-2 w-20">Qty</th>
                    <th className="text-right p-2 w-24">Unit Price</th>
                    <th className="text-left p-2 w-40">Account</th>
                    <th className="text-left p-2 w-32">VAT</th>
                    <th className="text-right p-2 w-24">Net</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const { net } = calculateLineTotals(line);
                    return (
                      <tr key={line.id} className="border-t">
                        <td className="p-2">
                          <Input
                            value={line.description}
                            onChange={(e) => updateLine(line.id, { description: e.target.value })}
                            placeholder="Description"
                            disabled={!isEditable}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) })}
                            className="text-right"
                            disabled={!isEditable}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(line.id, { unitPrice: Number(e.target.value) })}
                            className="text-right"
                            disabled={!isEditable}
                          />
                        </td>
                        <td className="p-2">
                          <Select
                            value={line.accountId}
                            onValueChange={(v) => updateLine(line.id, { accountId: v })}
                            disabled={!isEditable}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Account" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts?.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.code} - {a.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <Select
                            value={line.vatCodeId}
                            onValueChange={(v) => updateLine(line.id, { vatCodeId: v })}
                            disabled={!isEditable}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="VAT" />
                            </SelectTrigger>
                            <SelectContent>
                              {vatCodes?.map((v) => (
                                <SelectItem key={v.id} value={v.id}>
                                  {v.code} ({v.rate}%)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2 text-right font-mono">
                          {formatCurrency(net)}
                        </td>
                        <td className="p-2">
                          {isEditable && lines.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeLine(line.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Net:</span>
                  <span className="font-mono">{formatCurrency(totals.net)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>VAT:</span>
                  <span className="font-mono">{formatCurrency(totals.vat)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-2">
                  <span>Total:</span>
                  <span className="font-mono">{formatCurrency(totals.gross)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes..."
              disabled={!isEditable}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {isEditable && (
            <>
              <Button
                variant="outline"
                onClick={() => saveMutation.mutate(false)}
                disabled={saveMutation.isPending}
              >
                Save as Draft
              </Button>
              <Button
                onClick={() => saveMutation.mutate(true)}
                disabled={saveMutation.isPending || totals.gross <= 0}
              >
                Approve & Post
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
