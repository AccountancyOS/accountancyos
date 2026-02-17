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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { formatServiceType, formatStatus } from "@/lib/format-utils";
import { FileSpreadsheet, Search, FolderOpen } from "lucide-react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import WorkpaperTemplateManager from "@/components/workpaper/WorkpaperTemplateManager";

export default function Workpapers() {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("instances");

  // Query job_workpaper_instances (new model)
  const { data: instances, isLoading: instancesLoading } = useQuery({
    queryKey: ["job-workpaper-instances", organization?.id, typeFilter, statusFilter],
    queryFn: async () => {
      if (!organization?.id) return [];
      let query = supabase
        .from("job_workpaper_instances")
        .select(`
          *,
          job:jobs(id, job_name, client_id, company_id,
            client:clients(first_name, last_name),
            company:companies(company_name)
          )
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const filteredInstances = instances?.filter((wp: any) => {
    const searchLower = searchTerm.toLowerCase();
    const clientName = wp.job?.client
      ? `${wp.job.client.first_name} ${wp.job.client.last_name}`.toLowerCase()
      : "";
    const companyName = wp.job?.company?.company_name?.toLowerCase() || "";
    const wpName = wp.name?.toLowerCase() || "";
    const jobName = wp.job?.job_name?.toLowerCase() || "";
    return (
      clientName.includes(searchLower) ||
      companyName.includes(searchLower) ||
      wpName.includes(searchLower) ||
      jobName.includes(searchLower)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "locked": return "bg-green-500";
      case "in_review": return "bg-blue-500";
      case "draft": return "bg-yellow-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Workpapers</h1>
          <p className="text-muted-foreground mt-1">
            Practice-wide view of all workpapers and templates
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="instances">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Workpaper Instances
            </TabsTrigger>
            <TabsTrigger value="templates">
              <FolderOpen className="h-4 w-4 mr-2" />
              Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="instances" className="space-y-6 mt-6">
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
                        placeholder="Search by client, company, or job…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="in_review">In Review</SelectItem>
                        <SelectItem value="locked">Locked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Instances Table */}
            <Card>
              <CardHeader>
                <CardTitle>Workpaper Instances ({filteredInstances?.length || 0})</CardTitle>
                <CardDescription>Click any row to view the workpaper in its job context</CardDescription>
              </CardHeader>
              <CardContent>
                {instancesLoading ? (
                  <TableSkeleton columns={6} rows={6} />
                ) : filteredInstances && filteredInstances.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client/Company</TableHead>
                        <TableHead>Job</TableHead>
                        <TableHead>Workpaper</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInstances.map((wp: any) => (
                        <TableRow
                          key={wp.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/jobs/${wp.job_id}`)}
                        >
                          <TableCell className="font-medium">
                            {wp.job?.client
                              ? `${wp.job.client.first_name} ${wp.job.client.last_name}`
                              : wp.job?.company?.company_name ?? "—"}
                          </TableCell>
                          <TableCell>{wp.job?.job_name ?? "—"}</TableCell>
                          <TableCell>{wp.name}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(wp.status)}>
                              {formatStatus(wp.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(wp.updated_at), "d MMM yyyy")}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${wp.job_id}`); }}
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
                      {searchTerm || statusFilter !== "all"
                        ? "No workpapers match your filters"
                        : "No workpaper instances yet. They are created automatically when jobs are created."}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="mt-6">
            <WorkpaperTemplateManager />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
