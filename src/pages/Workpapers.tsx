import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { formatServiceType, formatStatus } from "@/lib/format-utils";
import { FileSpreadsheet, Search } from "lucide-react";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function Workpapers() {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: workpapers, isLoading } = useQuery({
    queryKey: ["workpapers", organization?.id, typeFilter, statusFilter],
    queryFn: async () => {
      if (!organization?.id) return [];

      let query = supabase
        .from("workpaper_instances")
        .select(`
          *,
          client:clients(first_name, last_name),
          company:companies(company_name),
          job:jobs(job_name, id)
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });

      if (typeFilter !== "all") {
        query = query.eq("service_type", typeFilter);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const filteredWorkpapers = workpapers?.filter((wp) => {
    const searchLower = searchTerm.toLowerCase();
    const clientName = wp.client
      ? `${wp.client.first_name} ${wp.client.last_name}`.toLowerCase()
      : "";
    const companyName = wp.company?.company_name?.toLowerCase() || "";
    const workpaperName = wp.name?.toLowerCase() || "";

    return (
      clientName.includes(searchLower) ||
      companyName.includes(searchLower) ||
      workpaperName.includes(searchLower)
    );
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
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Workpapers</h1>
          <p className="text-muted-foreground mt-1">
            Practice-wide view of all workpapers across clients
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by client or company..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="SA">Self Assessment</SelectItem>
                    <SelectItem value="CT600">Corporation Tax</SelectItem>
                    <SelectItem value="ACCOUNTS">Accounts</SelectItem>
                    <SelectItem value="VAT">VAT Return</SelectItem>
                    <SelectItem value="PAYROLL">Payroll</SelectItem>
                    <SelectItem value="CIS">CIS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="ready_for_review">Ready for Review</SelectItem>
                    <SelectItem value="finalised">Finalised</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Workpapers Table */}
        <Card>
          <CardHeader>
            <CardTitle>Workpapers ({filteredWorkpapers?.length || 0})</CardTitle>
            <CardDescription>
              Click any row to view the workpaper in its job context
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <TableSkeleton columns={7} rows={6} />
            ) : filteredWorkpapers && filteredWorkpapers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client/Company</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data Source</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWorkpapers.map((wp) => (
                    <TableRow
                      key={wp.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/jobs/${wp.job_id}`)}
                    >
                      <TableCell className="font-medium">
                        {wp.client
                          ? `${wp.client.first_name} ${wp.client.last_name}`
                          : wp.company?.company_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{formatServiceType(wp.service_type)}</Badge>
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
                        {format(new Date(wp.updated_at), "d MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/jobs/${wp.job_id}`);
                          }}
                        >
                          View Job
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {searchTerm || typeFilter !== "all" || statusFilter !== "all"
                    ? "No workpapers match your filters"
                    : "No workpapers yet"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
