import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, CreditCard, FileText } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { CreditNoteEditorDialog } from "./CreditNoteEditorDialog";
import { AllocateCreditDialog } from "./AllocateCreditDialog";

interface CreditNotesTabProps {
  entity: BookkeepingEntity | null;
}

type CreditNoteType = "all" | "sales" | "purchase";
type CreditNoteStatus = "all" | "draft" | "approved" | "allocated" | "void";

export function CreditNotesTab({ entity }: CreditNotesTabProps) {
  if (!entity) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Select an entity to view credit notes
      </div>
    );
  }
  const [typeFilter, setTypeFilter] = useState<CreditNoteType>("all");
  const [statusFilter, setStatusFilter] = useState<CreditNoteStatus>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [selectedCreditNote, setSelectedCreditNote] = useState<any>(null);
  const [editorType, setEditorType] = useState<"sales" | "purchase">("sales");
  const { organization } = useOrganization();

  const { data: creditNotes, isLoading } = useQuery({
    queryKey: [
      "credit-notes",
      organization?.id,
      entity.type,
      entity.id,
      typeFilter,
      statusFilter,
      dateFrom,
      dateTo,
    ],
    queryFn: async () => {
      if (!organization?.id) return [];

      const query = supabase
        .from("credit_notes")
        .select(`
          *,
          customer:customers(id, name),
          supplier:suppliers(id, name),
          original_invoice:invoices(id, invoice_number),
          original_bill:bills(id, bill_number)
        `)
        .eq("organization_id", organization.id)
        .order("issue_date", { ascending: false });

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      if (typeFilter === "sales") {
        query.eq("credit_note_type", "SALES");
      } else if (typeFilter === "purchase") {
        query.eq("credit_note_type", "PURCHASE");
      }

      if (statusFilter !== "all") {
        query.eq("status", statusFilter.toUpperCase());
      }

      if (dateFrom) {
        query.gte("issue_date", dateFrom);
      }
      if (dateTo) {
        query.lte("issue_date", dateTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case "DRAFT":
        return <Badge variant="secondary">Draft</Badge>;
      case "APPROVED":
        return <Badge variant="outline">Approved</Badge>;
      case "PARTIALLY_ALLOCATED":
        return <Badge className="bg-yellow-500">Partially Allocated</Badge>;
      case "FULLY_ALLOCATED":
        return <Badge variant="default">Fully Allocated</Badge>;
      case "VOID":
        return <Badge variant="destructive">Void</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    return type === "SALES" ? (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
        Sales
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        Purchase
      </Badge>
    );
  };

  const handleNewCreditNote = (type: "sales" | "purchase") => {
    setEditorType(type);
    setSelectedCreditNote(null);
    setEditorOpen(true);
  };

  const handleAllocate = (creditNote: any) => {
    setSelectedCreditNote(creditNote);
    setAllocateOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Credit Notes</h2>
          <p className="text-sm text-muted-foreground">
            Manage sales and purchase credit notes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleNewCreditNote("sales")}>
            <Plus className="h-4 w-4 mr-2" />
            Sales Credit Note
          </Button>
          <Button onClick={() => handleNewCreditNote("purchase")}>
            <Plus className="h-4 w-4 mr-2" />
            Purchase Credit Note
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 border rounded-lg bg-muted/30">
        <div className="space-y-1">
          <label className="text-xs font-medium">Type</label>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as CreditNoteType)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="sales">Sales</SelectItem>
              <SelectItem value="purchase">Purchase</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">Status</label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as CreditNoteStatus)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="allocated">Allocated</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">From Date</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[140px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium">To Date</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[140px]"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-[300px]">
          <p>Loading credit notes...</p>
        </div>
      ) : !creditNotes || creditNotes.length === 0 ? (
        <div className="flex items-center justify-center h-[300px] border border-dashed rounded-lg">
          <div className="text-center space-y-2">
            <CreditCard className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-lg font-medium">No credit notes</p>
            <p className="text-sm text-muted-foreground">
              Create a sales or purchase credit note to get started
            </p>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Original Doc</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creditNotes.map((cn) => {
                const remaining = Number(cn.remaining_allocation || 0);
                const contactName =
                  cn.credit_note_type === "SALES"
                    ? cn.customer?.name
                    : cn.supplier?.name;
                const originalDoc =
                  cn.credit_note_type === "SALES"
                    ? cn.original_invoice?.invoice_number
                    : cn.original_bill?.bill_number;

                return (
                  <TableRow key={cn.id}>
                    <TableCell>
                      {format(new Date(cn.issue_date), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="font-medium">
                      {cn.credit_note_number || cn.id.substring(0, 8)}
                    </TableCell>
                    <TableCell>{getTypeBadge(cn.credit_note_type)}</TableCell>
                    <TableCell>{contactName || "—"}</TableCell>
                    <TableCell>
                      {originalDoc ? (
                        <span className="text-sm text-muted-foreground">
                          <FileText className="h-3 w-3 inline mr-1" />
                          {originalDoc}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(cn.total)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(remaining)}
                    </TableCell>
                    <TableCell>{getStatusBadge(cn.status)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        {cn.status === "DRAFT" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedCreditNote(cn);
                              setEditorType(cn.credit_note_type === "SALES" ? "sales" : "purchase");
                              setEditorOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        {cn.status === "APPROVED" && remaining > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAllocate(cn)}
                          >
                            Allocate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CreditNoteEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        entity={entity}
        creditNoteType={editorType}
        creditNote={selectedCreditNote}
      />

      {selectedCreditNote && (
        <AllocateCreditDialog
          open={allocateOpen}
          onOpenChange={setAllocateOpen}
          creditNote={selectedCreditNote}
          entity={entity}
        />
      )}
    </div>
  );
}
