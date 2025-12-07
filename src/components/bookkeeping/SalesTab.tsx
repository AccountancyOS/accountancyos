import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye, CreditCard, FileX } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { format } from "date-fns";
import { InvoiceEditorDialog } from "./InvoiceEditorDialog";
import RecordPaymentDialog from "./RecordPaymentDialog";

import type { BookkeepingEntity } from "./EntitySelector";

interface SalesTabProps {
  entity: BookkeepingEntity | null;
}

const statusColors: Record<string, string> = {
  DRAFT: "secondary",
  AWAITING_PAYMENT: "default",
  PART_PAID: "outline",
  PAID: "default",
  OVERDUE: "destructive",
  VOID: "secondary",
};

export default function SalesTab({ entity }: SalesTabProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);

  // Fetch customers for filter dropdown
  const { data: customers } = useQuery({
    queryKey: ["customers", entity?.type, entity?.id],
    queryFn: async () => {
      if (!entity) return [];
      const { data } = await supabase
        .from("customers")
        .select("id, name")
        .eq(entity.type === "company" ? "company_id" : "client_id", entity.id)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!entity,
  });

  // Fetch invoices
  const { data: invoices, isLoading } = useQuery({
    queryKey: ["sales-invoices", entity?.type, entity?.id, statusFilter, customerFilter],
    queryFn: async () => {
      if (!entity || !organization?.id) return [];

      let query = supabase
        .from("invoices")
        .select("*, customers(name)")
        .eq("organization_id", organization.id)
        .eq(entity.type === "company" ? "company_id" : "client_id", entity.id)
        .eq("invoice_type", "SALES")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (customerFilter !== "all") {
        query = query.eq("customer_id", customerFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!entity && !!organization?.id,
  });

  const filteredInvoices = (invoices || []).filter(
    (inv) =>
      inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      (inv.customers as any)?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleNew = () => {
    setSelectedInvoice(null);
    setEditorOpen(true);
  };

  const handleView = (invoice: any) => {
    setSelectedInvoice(invoice);
    setEditorOpen(true);
  };

  const handleRecordPayment = (invoiceId: string) => {
    setPaymentInvoiceId(invoiceId);
    setPaymentDialogOpen(true);
  };

  const getStatusLabel = (status: string) => {
    return status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (!entity) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Select an entity to view sales invoices
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="AWAITING_PAYMENT">Awaiting Payment</SelectItem>
              <SelectItem value="PART_PAID">Part Paid</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="OVERDUE">Overdue</SelectItem>
              <SelectItem value="VOID">Void</SelectItem>
            </SelectContent>
          </Select>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers?.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleNew}>
          <Plus className="mr-2 h-4 w-4" />
          New Invoice
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No invoices found
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">
                    {invoice.invoice_number || "—"}
                  </TableCell>
                  <TableCell>
                    {invoice.created_at
                      ? format(new Date(invoice.created_at), "dd MMM yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell>{(invoice.customers as any)?.name || "—"}</TableCell>
                  <TableCell>
                    {invoice.due_date
                      ? format(new Date(invoice.due_date), "dd MMM yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(invoice.total_gross)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(invoice.remaining_balance ?? invoice.total_gross)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusColors[invoice.status] as any || "secondary"}>
                      {getStatusLabel(invoice.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleView(invoice)}
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {invoice.status !== "PAID" && invoice.status !== "VOID" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRecordPayment(invoice.id)}
                          title="Record Payment"
                        >
                          <CreditCard className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editorOpen && (
        <InvoiceEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          invoice={selectedInvoice}
          entity={{ type: entity.type, id: entity.id, name: "", displayName: "" }}
          invoiceType="SALES"
        />
      )}

      {paymentInvoiceId && (
        <RecordPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          invoiceId={paymentInvoiceId}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
            setPaymentDialogOpen(false);
            setPaymentInvoiceId(null);
          }}
        />
      )}
    </div>
  );
}
