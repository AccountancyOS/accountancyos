import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Filter, Briefcase } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, differenceInDays } from "date-fns";
import CreateJobDialog from "@/components/jobs/CreateJobDialog";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function Jobs() {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs", organization?.id, statusFilter, serviceFilter, assigneeFilter],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      let query = supabase
        .from("jobs")
        .select(`
          *,
          clients (first_name, last_name),
          companies (company_name)
        `)
        .eq("organization_id", organization.id)
        .order("filing_deadline", { ascending: true, nullsFirst: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (serviceFilter !== "all") {
        query = query.eq("service_type", serviceFilter);
      }
      if (assigneeFilter !== "all") {
        query = query.eq("assigned_to", assigneeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const filteredJobs = jobs?.filter(job =>
    job.job_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (job.clients && `${job.clients.first_name} ${job.clients.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (job.companies && job.companies.company_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getStatusColor = (status: string): "default" | "destructive" | "outline" | "secondary" => {
    const colors: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
      not_started: "default",
      in_progress: "default",
      waiting_on_client: "secondary",
      with_reviewer: "secondary",
      filed: "default",
      on_hold: "destructive",
      cancelled: "destructive",
      completed: "default",
    };
    return colors[status] || "default";
  };

  const getPriorityColor = (priority: string): "default" | "destructive" | "outline" | "secondary" => {
    const colors: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
      low: "default",
      normal: "default",
      high: "secondary",
      critical: "destructive",
    };
    return colors[priority] || "default";
  };

  const getDaysRemaining = (deadline: string | null) => {
    if (!deadline) return null;
    const days = differenceInDays(new Date(deadline), new Date());
    return days;
  };

  const formatDeadline = (deadline: string | null, days: number | null) => {
    if (!deadline) return "No deadline";
    if (days === null) return format(new Date(deadline), "dd MMM yyyy");
    
    if (days < 0) return <span className="text-destructive font-medium">{Math.abs(days)} days overdue</span>;
    if (days === 0) return <span className="text-destructive font-medium">Due today</span>;
    if (days <= 7) return <span className="text-secondary font-medium">Due in {days} days</span>;
    return format(new Date(deadline), "dd MMM yyyy");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Jobs</h1>
            <p className="text-muted-foreground">
              Manage all client work, deadlines, and workflows
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Job
          </Button>
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm">
            My Jobs
          </Button>
          <Button variant="outline" size="sm">
            Overdue
          </Button>
          <Button variant="outline" size="sm">
            Due This Week
          </Button>
          <Button variant="outline" size="sm">
            Unassigned
          </Button>
          <Button variant="outline" size="sm">
            Waiting on Client
          </Button>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs, clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="waiting_on_client">Waiting on Client</SelectItem>
              <SelectItem value="with_reviewer">With Reviewer</SelectItem>
              <SelectItem value="filed">Filed</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              <SelectItem value="Accounts">Accounts</SelectItem>
              <SelectItem value="CT600">Corporation Tax</SelectItem>
              <SelectItem value="SA">Self Assessment</SelectItem>
              <SelectItem value="VAT">VAT</SelectItem>
              <SelectItem value="Bookkeeping">Bookkeeping</SelectItem>
              <SelectItem value="Payroll">Payroll</SelectItem>
              <SelectItem value="Advisory">Advisory</SelectItem>
              <SelectItem value="Company Sec">Company Sec</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Jobs Table */}
        {isLoading ? (
          <TableSkeleton columns={8} rows={6} />
        ) : filteredJobs && filteredJobs.length > 0 ? (
          <div className="border rounded-lg animate-fade-in">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Filing Deadline</TableHead>
                  <TableHead>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => {
                  const daysRemaining = getDaysRemaining(job.filing_deadline);
                  return (
                    <TableRow
                      key={job.id}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => navigate(`/jobs/${job.id}`)}
                    >
                      <TableCell className="font-medium">{job.job_name}</TableCell>
                      <TableCell>
                        {job.clients
                          ? `${job.clients.first_name} ${job.clients.last_name}`
                          : job.companies?.company_name || "-"}
                      </TableCell>
                      <TableCell>{job.service_type}</TableCell>
                      <TableCell>
                        {job.period_label || (job.period_end ? format(new Date(job.period_end), "MMM yyyy") : "-")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(job.status)}>
                          {job.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPriorityColor(job.priority)}>
                          {job.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatDeadline(job.filing_deadline, daysRemaining)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground min-w-[3ch]">
                            {job.progress}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            icon={Briefcase}
            title="No jobs yet"
            description="Create your first job to start tracking client work, deadlines, and workflows."
            actionLabel="Create Job"
            onAction={() => setShowCreateDialog(true)}
          />
        )}
      </div>

      <CreateJobDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </DashboardLayout>
  );
}
