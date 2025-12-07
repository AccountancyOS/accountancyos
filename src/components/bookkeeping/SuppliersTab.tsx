import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, Search, Pencil, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import SupplierEditorDialog from "./SupplierEditorDialog";
import SupplierStatementDialog from "./SupplierStatementDialog";

interface SuppliersTabProps {
  entity: { type: "client" | "company"; id: string } | null;
}

export default function SuppliersTab({ entity }: SuppliersTabProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [statementSupplierId, setStatementSupplierId] = useState<string | null>(null);

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ["suppliers", entity?.type, entity?.id, statusFilter],
    queryFn: async () => {
      if (!entity) return [];

      let query = supabase
        .from("suppliers")
        .select("*")
        .eq(entity.type === "company" ? "company_id" : "client_id", entity.id);

      if (statusFilter === "active") {
        query = query.eq("is_active", true);
      } else if (statusFilter === "inactive") {
        query = query.eq("is_active", false);
      }

      const { data, error } = await query.order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!entity,
  });

  const deleteMutation = useMutation({
    mutationFn: async (supplierId: string) => {
      const { error } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", supplierId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier deleted");
    },
    onError: (error: any) => {
      toast.error("Failed to delete supplier: " + error.message);
    },
  });

  const filteredSuppliers = (suppliers || []).filter((supplier) =>
    supplier.name.toLowerCase().includes(search.toLowerCase()) ||
    supplier.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (supplier: any) => {
    setSelectedSupplier(supplier);
    setEditorOpen(true);
  };

  const handleNew = () => {
    setSelectedSupplier(null);
    setEditorOpen(true);
  };

  const handleDelete = (supplierId: string) => {
    if (confirm("Are you sure you want to delete this supplier?")) {
      deleteMutation.mutate(supplierId);
    }
  };

  if (!entity) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Select an entity to view suppliers
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
              placeholder="Search suppliers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleNew}>
          <Plus className="mr-2 h-4 w-4" />
          New Supplier
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Payment Terms</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredSuppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No suppliers found
                </TableCell>
              </TableRow>
            ) : (
              filteredSuppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell>{supplier.email || "—"}</TableCell>
                  <TableCell>{supplier.phone || "—"}</TableCell>
                  <TableCell>{supplier.payment_terms_days || 30} days</TableCell>
                  <TableCell>
                    <Badge variant={supplier.is_active ? "default" : "secondary"}>
                      {supplier.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setStatementSupplierId(supplier.id)}
                        title="View Statement"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(supplier)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(supplier.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SupplierEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        supplier={selectedSupplier}
        entity={entity}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["suppliers"] });
          setEditorOpen(false);
        }}
      />

      {statementSupplierId && (
        <SupplierStatementDialog
          open={!!statementSupplierId}
          onOpenChange={() => setStatementSupplierId(null)}
          supplierId={statementSupplierId}
        />
      )}
    </div>
  );
}
