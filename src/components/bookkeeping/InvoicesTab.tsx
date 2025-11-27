import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Plus, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { InvoiceEditorDialog } from "./InvoiceEditorDialog";

interface InvoicesTabProps {
  entity: BookkeepingEntity;
}

export function InvoicesTab({ entity }: InvoicesTabProps) {
  const [invoiceType, setInvoiceType] = useState<"SALES" | "PURCHASE">("SALES");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const { organization } = useOrganization();

  const { data: invoices, isLoading } = useQuery({
    queryKey: [
      "invoices",
      organization?.id,
      entity.type,
      entity.id,
      invoiceType,
    ],
    queryFn: async () => {
      if (!organization?.id) return [];

      const query = supabase
        .from("invoices")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("invoice_type", invoiceType)
        .order("issue_date", { ascending: false });

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PAID":
        return <Badge variant="default">Paid</Badge>;
      case "AWAITING_PAYMENT":
        return <Badge variant="outline">Awaiting Payment</Badge>;
      case "PART_PAID":
        return <Badge className="bg-yellow-500">Part Paid</Badge>;
      case "OVERDUE":
        return <Badge variant="destructive">Overdue</Badge>;
      case "DRAFT":
        return <Badge variant="secondary">Draft</Badge>;
      case "VOID":
        return <Badge variant="secondary">Void</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Invoices</h2>
          <p className="text-sm text-muted-foreground">
            Manage sales and purchase invoices for {entity.name}
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedInvoice(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New {invoiceType === "SALES" ? "Sales" : "Purchase"} Invoice
        </Button>
      </div>

      <Tabs value={invoiceType} onValueChange={(v) => setInvoiceType(v as any)}>
        <TabsList>
          <TabsTrigger value="SALES">Sales Invoices</TabsTrigger>
          <TabsTrigger value="PURCHASE">Purchase Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value={invoiceType} className="space-y-4">
          {isLoading ? (
            <div>Loading invoices...</div>
          ) : !invoices || invoices.length === 0 ? (
            <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg">
              <div className="text-center space-y-4">
                <p className="text-lg font-medium">No invoices yet</p>
                <p className="text-sm text-muted-foreground">
                  Create your first {invoiceType.toLowerCase()} invoice
                </p>
              </div>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Posted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedInvoice(invoice);
                        setEditorOpen(true);
                      }}
                    >
                      <TableCell className="font-medium">
                        {invoice.invoice_number || "—"}
                      </TableCell>
                      <TableCell>
                        {format(new Date(invoice.issue_date), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        {format(new Date(invoice.due_date), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>{invoice.contact_name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(invoice.total_gross)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(invoice.amount_paid)}
                      </TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell className="text-center">
                        {invoice.is_posted && (
                          <FileText className="h-4 w-4 inline text-green-600" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <InvoiceEditorDialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setSelectedInvoice(null);
        }}
        entity={entity}
        invoiceType={invoiceType}
        invoice={selectedInvoice}
      />
    </div>
  );
}
