import { useState, useMemo } from "react";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Eye, Search } from "lucide-react";
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
  lead?: { first_name: string | null; last_name: string | null; email: string | null } | null;
  client?: { first_name: string | null; last_name: string | null; email: string | null } | null;
  company?: { company_name: string | null; email: string | null } | null;
}

const Quotes = () => {
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: quotes, isLoading } = useQuery({
    queryKey: ["quotes", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("quotes")
        .select(`
          *,
          lead:leads(first_name, last_name, email),
          client:clients(first_name, last_name, email),
          company:companies!quotes_company_id_fkey(company_name, email)
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Quote[];
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

  const recipientFor = (q: Quote) => {
    if (q.company?.company_name) return { name: q.company.company_name, email: q.company.email };
    if (q.lead) {
      const name = `${q.lead.first_name ?? ""} ${q.lead.last_name ?? ""}`.trim();
      return { name: name || q.lead.email || "—", email: q.lead.email };
    }
    if (q.client) {
      const name = `${q.client.first_name ?? ""} ${q.client.last_name ?? ""}`.trim();
      return { name: name || q.client.email || "—", email: q.client.email };
    }
    return { name: "—", email: null as string | null };
  };

  const filteredQuotes = useMemo(() => {
    if (!quotes) return [];
    const term = search.trim().toLowerCase();
    if (!term) return quotes;
    return quotes.filter((q) => {
      const r = recipientFor(q);
      return (
        q.quote_number.toLowerCase().includes(term) ||
        (r.name && r.name.toLowerCase().includes(term)) ||
        (r.email && r.email.toLowerCase().includes(term))
      );
    });
  }, [quotes, search]);

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
        <TableSkeleton columns={7} rows={6} />
      ) : !quotes?.length ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">No quotes yet</p>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Quote
          </Button>
        </div>
      ) : (
        <>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by recipient or quote number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Quote #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQuotes.map((quote) => {
                const r = recipientFor(quote);
                return (
                <TableRow
                  key={quote.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/quotes/${quote.id}`)}
                >
                  <TableCell>
                    <div className="font-medium text-foreground">{r.name}</div>
                    {r.email && (
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
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
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/quotes/${quote.id}`);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        </>
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
