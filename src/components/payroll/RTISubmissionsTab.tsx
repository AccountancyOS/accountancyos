import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { RTI_FILING_LABELS, RTI_FILING_TYPES, type RTIFilingType } from "@/lib/payroll-constants";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { FileText } from "lucide-react";

interface RTISubmissionsTabProps {
  selectedEntity: BookkeepingEntity | null;
  selectedSchemeId: string | null;
  taxYear: string;
}

export function RTISubmissionsTab({ selectedEntity, selectedSchemeId, taxYear }: RTISubmissionsTabProps) {
  const { organization } = useOrganization();
  const navigate = useNavigate();

  const { data: filings, isLoading } = useQuery({
    queryKey: ["rti-filings", organization?.id, selectedEntity?.id, selectedSchemeId, taxYear],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      let query = supabase
        .from("filings")
        .select(`
          *,
          companies (id, company_name),
          clients (id, first_name, last_name)
        `)
        .eq("organization_id", organization.id)
        .eq("filing_body", "HMRC")
        .in("filing_type", RTI_FILING_TYPES as unknown as string[])
        .eq("tax_year", taxYear);

      if (selectedEntity) {
        if (selectedEntity.type === "company") {
          query = query.eq("company_id", selectedEntity.id);
        } else {
          query = query.eq("client_id", selectedEntity.id);
        }
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "secondary",
      in_progress: "outline",
      awaiting_approval: "outline",
      approved: "default",
      ready_to_file: "default",
      filed: "default",
      rejected: "destructive",
    };
    return <Badge variant={variants[status] || "secondary"}>{status.replace('_', ' ')}</Badge>;
  };

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>RTI Submissions</CardTitle>
        <CardDescription>
          Real Time Information submissions to HMRC for {taxYear}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!filings?.length ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No RTI Submissions</h3>
            <p className="text-muted-foreground">
              No RTI submissions found for {taxYear}. Submissions are created when you submit pay runs.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filings.map((filing) => {
                const employerName = filing.companies?.company_name || 
                  (filing.clients ? `${filing.clients.first_name} ${filing.clients.last_name}` : '-');
                const filingType = filing.filing_type as RTIFilingType;

                return (
                  <TableRow 
                    key={filing.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/filings/${filing.id}`)}
                  >
                    <TableCell className="font-medium">{employerName}</TableCell>
                    <TableCell>{RTI_FILING_LABELS[filingType] || filing.filing_type}</TableCell>
                    <TableCell>
                      {filing.period_start && filing.period_end ? (
                        <>
                          {format(new Date(filing.period_start), "d MMM")} - {format(new Date(filing.period_end), "d MMM")}
                        </>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(filing.status)}</TableCell>
                    <TableCell>
                      {filing.filed_at ? format(new Date(filing.filed_at), "d MMM yyyy HH:mm") : '-'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {filing.filing_reference || '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
