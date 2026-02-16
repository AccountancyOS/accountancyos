import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import { formatServiceType, formatStatus } from "@/lib/format-utils";

interface ClientWorkpapersTabProps {
  clientId: string;
}

export default function ClientWorkpapersTab({ clientId }: ClientWorkpapersTabProps) {
  const navigate = useNavigate();

  const { data: workpapers, isLoading } = useQuery({
    queryKey: ["client-workpapers", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workpaper_instances")
        .select(`
          *,
          job:jobs(id, job_name)
        `)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "finalised":
        return "bg-green-500";
      case "ready_for_review":
        return "bg-blue-500";
      case "in_progress":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workpapers</CardTitle>
        <CardDescription>
          All workpapers for this client across all services and periods
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading workpapers...
          </div>
        ) : workpapers && workpapers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service Type</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data Source</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workpapers.map((wp) => (
                <TableRow
                  key={wp.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/jobs/${wp.job_id}`)}
                >
                  <TableCell>
                    <div className="font-medium">{formatServiceType(wp.service_type)}</div>
                    <div className="text-sm text-muted-foreground">{wp.name}</div>
                  </TableCell>
                  <TableCell>
                    {wp.period_label ||
                      (wp.period_start && wp.period_end
                        ? `${format(new Date(wp.period_start), "MMM yyyy")} - ${format(
                            new Date(wp.period_end),
                            "MMM yyyy"
                          )}`
                        : "N/A")}
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(wp.status)}>
                      {formatStatus(wp.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {wp.data_source ? (
                      <Badge variant="secondary">{wp.data_source}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(wp.updated_at), "d MMM yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/jobs/${wp.job_id}`);
                      }}
                    >
                      View in Job
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-12">
            <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No workpapers for this client yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Workpapers are created automatically when questionnaires are submitted or jobs progress
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
