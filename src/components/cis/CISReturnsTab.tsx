import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { CIS_RETURN_STATUS_LABELS, type CISReturnStatus } from "@/lib/payroll-constants";
import { format } from "date-fns";
import { FileText } from "lucide-react";

interface CISReturnsTabProps { selectedEntity: BookkeepingEntity | null; }

export function CISReturnsTab({ selectedEntity }: CISReturnsTabProps) {
  const { organization } = useOrganization();
  const navigate = useNavigate();

  const { data: returns, isLoading } = useQuery({
    queryKey: ["cis-returns", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase.from("cis_returns").select("*, cis_contractors(name)").eq("organization_id", organization.id).order("due_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  if (isLoading) return <Skeleton className="h-[400px] w-full" />;

  const getStatusBadge = (status: string) => {
    const s = status as CISReturnStatus;
    const variants: Record<CISReturnStatus, "default" | "secondary" | "destructive"> = { draft: "secondary", ready: "secondary", submitted: "default", accepted: "default", rejected: "destructive" };
    return <Badge variant={variants[s] || "secondary"}>{CIS_RETURN_STATUS_LABELS[s] || status}</Badge>;
  };

  return (
    <Card>
      <CardHeader><CardTitle>CIS Returns</CardTitle><CardDescription>Monthly CIS returns to HMRC</CardDescription></CardHeader>
      <CardContent>
        {!returns?.length ? (
          <div className="text-center py-12"><FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><h3 className="text-lg font-medium mb-2">No Returns</h3><p className="text-muted-foreground">No CIS returns found.</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Contractor</TableHead><TableHead>Tax Month</TableHead><TableHead>Tax Year</TableHead><TableHead>Due Date</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {returns.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/cis/returns/${r.id}`)}>
                  <TableCell className="font-medium">{(r.cis_contractors as any)?.name}</TableCell><TableCell>Month {r.tax_month}</TableCell><TableCell>{r.tax_year}</TableCell><TableCell>{format(new Date(r.due_date), "d MMM yyyy")}</TableCell><TableCell>{getStatusBadge(r.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
