import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Plus, Search, Eye, CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { format } from "date-fns";
import BillEditorDialog from "./BillEditorDialog";
import RecordBillPaymentDialog from "./RecordBillPaymentDialog";

import type { BookkeepingEntity } from "./EntitySelector";

interface BillsTabProps {
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

export default function BillsTab({ entity }: BillsTabProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<any>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentBillId, setPaymentBillId] = useState<string | null>(null);

  // Fetch suppliers for filter dropdown
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", entity?.type, entity?.id],
    queryFn: async () => {
      if (!entity) return [];
      const { data } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq(entity.type === "company" ? "company_id" : "client_id", entity.id)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!entity,
  });

  // Fetch bills
  const { data: bills, isLoading } = useQuery({
    queryKey: ["bills", entity?.type, entity?.id, statusFilter, supplierFilter],
    queryFn: async () => {
      if (!entity || !organization?.id) return [];

      let query = supabase
        .from("bills")
        .select("*, suppliers(name)")
        .eq("organization_id", organization.id)
        .eq(entity.type === "company" ? "company_id" : "client_id", entity.id);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (supplierFilter !== "all") {
        query = query.eq("supplier_id", supplierFilter);
      }

      const { data, error } = await query.order("issue_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!entity && !!organization?.id,
  });

  const filteredBills = (bills || []).filter(
    (bill) =>
      bill.bill_number?.toLowerCase().includes(search.toLowerCase()) ||
      (bill.suppliers as any)?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleNew = () => {
    setSelectedBill(null);
    setEditorOpen(true);
  };

  const handleView = (bill: any) => {
    setSelectedBill(bill);
    setEditorOpen(true);
  };

  const handleRecordPayment = (billId: string) => {
    setPaymentBillId(billId);
    setPaymentDialogOpen(true);
  };

  const getStatusLabel = (status: string) => {
    return status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (!entity) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Select an entity to view bills
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
              placeholder="Search bills..."
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
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers?.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleNew}>
          <Plus className="mr-2 h-4 w-4" />
          New Bill
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Supplier</TableHead>
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
            ) : filteredBills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No bills found
                </TableCell>
              </TableRow>
            ) : (
              filteredBills.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell className="font-medium">
                    {bill.bill_number || "—"}
                  </TableCell>
                  <TableCell>
                    {bill.issue_date
                      ? format(new Date(bill.issue_date), "dd MMM yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell>{(bill.suppliers as any)?.name || "—"}</TableCell>
                  <TableCell>
                    {bill.due_date
                      ? format(new Date(bill.due_date), "dd MMM yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(bill.total_gross)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(bill.remaining_balance ?? bill.total_gross)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusColors[bill.status] as any || "secondary"}>
                      {getStatusLabel(bill.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleView(bill)}
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {bill.status !== "PAID" && bill.status !== "VOID" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRecordPayment(bill.id)}
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

      <BillEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        bill={selectedBill}
        entity={entity}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["bills"] });
          setEditorOpen(false);
        }}
      />

      {paymentBillId && (
        <RecordBillPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          billId={paymentBillId}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            setPaymentDialogOpen(false);
            setPaymentBillId(null);
          }}
        />
      )}
    </div>
  );
}
