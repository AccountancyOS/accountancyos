import { useState } from "react";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Eye } from "lucide-react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import CreateQuoteDialog from "@/components/quotes/CreateQuoteDialog";
import DashboardLayout from "@/components/DashboardLayout";

interface Quote {
  id: string;
  quote_number: string;
  status: string;
  total_amount: number;
  valid_until: string | null;
  created_at: string;
  lead_id: string | null;
  client_id: string | null;
  company_id: string | null;
}

const Quotes = () => {
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const { data: quotes, isLoading } = useQuery({
    queryKey: ["quotes", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Quote[];
    },
    enabled: !!organization?.id,
  });

  const statusColors = {
    draft: "secondary",
    sent: "default",
    accepted: "default",
    rejected: "destructive",
    expired: "secondary",
  } as const;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Quotes</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage client quotes
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Quote
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton columns={6} rows={6} />
      ) : !quotes?.length ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">No quotes yet</p>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Quote
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell className="font-mono font-medium">
                    {quote.quote_number}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusColors[quote.status as keyof typeof statusColors]}>
                      {quote.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    £{quote.total_amount.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {quote.valid_until
                      ? format(new Date(quote.valid_until), "dd MMM yyyy")
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {format(new Date(quote.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/quotes/${quote.id}`)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

        <CreateQuoteDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
};

export default Quotes;
