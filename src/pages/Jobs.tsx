import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Filter, Briefcase, X } from "lucide-react";
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
import { differenceInDays } from "date-fns";
import CreateJobDialog from "@/components/jobs/CreateJobDialog";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { JobsQuickFilters } from "@/components/jobs/JobsQuickFilters";
import { SavedViewsDropdown } from "@/components/jobs/SavedViewsDropdown";
import { useJobFilters } from "@/hooks/useJobFilters";
import { formatDate, formatServiceType, formatStatus, formatPriority } from "@/lib/format-utils";
import { queryKeys } from "@/lib/queryKeys";

export default function Jobs() {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyFilter = searchParams.get("company");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  const {
    filters,
    setFilters,
    clearFilters,
    hasActiveFilters,
    applyQuickFilter,
    savedViews,
    isLoadingViews,
    applySavedView,
    saveCurrentView,
    removeSavedView,
  } = useJobFilters();

  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);
  const [currentViewId, setCurrentViewId] = useState<string | undefined>();

  const { data: jobs, isLoading } = useQuery({
    queryKey: queryKeys.jobs(organization?.id || "", filters as Record<string, unknown>),
    queryFn: async () => {
      if (!organization?.id) return [];
      
      let query = supabase
        .from("jobs")
        .select(`
          *,
          clients!fk_jobs_client (first_name, last_name),
          companies!fk_jobs_company (company_name)
        `)
        .eq("organization_id", organization.id);

      // Apply status filter
      if (filters.status?.length) {
        query = query.in("status", filters.status);
      }
      
      // Apply service type filter
      if (filters.serviceType?.length) {
        query = query.in("service_type", filters.serviceType);
      }

      // Apply assignee filter
      if (filters.assignee) {
        if (filters.assignee === "me" && user?.id) {
          query = query.eq("assigned_to", user.id);
        } else if (filters.assignee === "unassigned") {
          query = query.is("assigned_to", null);
        } else {
          query = query.eq("assigned_to", filters.assignee);
        }
      }

      // Apply due date filter
      if (filters.due) {
        const today = new Date().toISOString().split("T")[0];
        const now = new Date();
        
        if (filters.due === "today") {
          query = query.eq("filing_deadline", today);
        } else if (filters.due === "this_week") {
          const weekEnd = new Date(now);
          weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
          query = query.gte("filing_deadline", today).lte("filing_deadline", weekEnd.toISOString().split("T")[0]);
        } else if (filters.due === "this_month") {
          const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          query = query.gte("filing_deadline", today).lte("filing_deadline", monthEnd.toISOString().split("T")[0]);
        } else if (filters.due === "overdue") {
          query = query.lt("filing_deadline", today).not("status", "eq", "completed");
        }
      }

      // Apply search filter
      if (filters.search?.trim()) {
        query = query.ilike("job_name", `%${filters.search.trim()}%`);
      }

      const { data, error } = await query.order("filing_deadline", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  // Calculate job counts for quick filters
  const jobCounts = useMemo(() => {
    if (!jobs || !user?.id) return {};
    const today = new Date().toISOString().split("T")[0];
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    
    return {
      my_jobs: jobs.filter(j => j.assigned_to === user.id).length,
      overdue: jobs.filter(j => j.filing_deadline && j.filing_deadline < today && j.status !== "completed").length,
      due_this_week: jobs.filter(j => j.filing_deadline && j.filing_deadline >= today && j.filing_deadline <= weekEnd.toISOString().split("T")[0]).length,
      unassigned: jobs.filter(j => !j.assigned_to).length,
      records_requested: jobs.filter(j => j.status === "records_requested").length,
      client_queries: jobs.filter(j => j.status === "client_queries").length,
      accountant_review: jobs.filter(j => j.status === "accountant_review").length,
    };
  }, [jobs, user?.id]);

  const handleQuickFilter = (filterId: string | null) => {
    setActiveQuickFilter(filterId);
    setCurrentViewId(undefined);
    if (filterId) {
      applyQuickFilter(filterId);
    } else {
      clearFilters();
    }
  };

  const handleApplySavedView = (view: any) => {
    setActiveQuickFilter(null);
    setCurrentViewId(view.id);
    applySavedView(view);
  };

  const handleClearFilters = () => {
    setActiveQuickFilter(null);
    setCurrentViewId(undefined);
    clearFilters();
  };

  const getStatusColor = (status: string): "default" | "destructive" | "outline" | "secondary" => {
    const colors: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
      blank: "outline",
      records_requested: "secondary",
      records_received: "secondary",
      accountant_queries: "secondary",
      client_queries: "secondary",
      accountant_review: "default",
      client_review: "default",
      ready_to_file: "default",
      completed: "default",
    };
    return colors[status] || "default";
  };

  const getDeadlineThresholdDays = (serviceType: string | null): number => {
    if (!serviceType) return 14;
    const st = serviceType.toLowerCase();
    if (["accounts", "company_accounts", "self_assessment", "sa", "corporation_tax", "ct600", "advisory"].includes(st)) return 30;
    if (["vat", "vat_return", "payroll", "cis", "company_sec", "cs01"].includes(st)) return 7;
    return 14;
  };

  const getDaysRemaining = (deadline: string | null) => {
    if (!deadline) return null;
    return differenceInDays(new Date(deadline), new Date());
  };

  const formatDeadline = (deadline: string | null, days: number | null, serviceType: string | null) => {
    if (!deadline) return "No deadline";
    if (days === null) return formatDate(deadline, "dayMonthYear");
    
    const threshold = getDeadlineThresholdDays(serviceType);
    
    if (days < 0) return <span className="text-destructive font-medium">{Math.abs(days)} days overdue</span>;
    if (days === 0) return <span className="text-destructive font-medium">Due today</span>;
    if (days <= threshold) return <span className="text-amber-600 font-medium">Due in {days} days</span>;
    return formatDate(deadline, "dayMonthYear");
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Jobs</h1>
            <p className="text-muted-foreground mt-1">
              Manage all client work, deadlines, and workflows
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Job
          </Button>
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <JobsQuickFilters
            activeFilter={activeQuickFilter}
            onFilterChange={handleQuickFilter}
            jobCounts={jobCounts}
          />
          
          <div className="flex items-center gap-2 ml-auto">
            <SavedViewsDropdown
              savedViews={savedViews}
              currentViewId={currentViewId}
              hasActiveFilters={hasActiveFilters}
              onApplyView={handleApplySavedView}
              onSaveView={saveCurrentView}
              onDeleteView={removeSavedView}
              isLoading={isLoadingViews}
            />
            
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Search and Advanced Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs, clients..."
              value={filters.search || ""}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-9"
            />
          </div>
          
          <Select 
            value={filters.status?.[0] || "all"} 
            onValueChange={(val) => setFilters({ ...filters, status: val === "all" ? undefined : [val] })}
          >
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="blank">—</SelectItem>
              <SelectItem value="records_requested">Records Requested</SelectItem>
              <SelectItem value="records_received">Records Received</SelectItem>
              <SelectItem value="accountant_queries">Accountant Queries</SelectItem>
              <SelectItem value="client_queries">Client Queries</SelectItem>
              <SelectItem value="accountant_review">Accountant Review</SelectItem>
              <SelectItem value="client_review">Client Review</SelectItem>
              <SelectItem value="ready_to_file">Ready to File</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          <Select 
            value={filters.serviceType?.[0] || "all"} 
            onValueChange={(val) => setFilters({ ...filters, serviceType: val === "all" ? undefined : [val] })}
          >
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

          <Select 
            value={filters.due || "all"} 
            onValueChange={(val) => setFilters({ ...filters, due: val === "all" ? undefined : val as any })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Due Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dates</SelectItem>
              <SelectItem value="today">Due Today</SelectItem>
              <SelectItem value="this_week">Due This Week</SelectItem>
              <SelectItem value="this_month">Due This Month</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Jobs Table */}
        {isLoading ? (
          <TableSkeleton columns={7} rows={6} />
        ) : jobs && jobs.length > 0 ? (
          <div className="border rounded-lg animate-fade-in">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                   <TableHead>Filing Deadline</TableHead>
                  
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
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
                      <TableCell>{formatServiceType(job.service_type)}</TableCell>
                      <TableCell>
                        {job.period_label || (job.period_end ? formatDate(job.period_end, "monthYear") : "-")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(job.status)}>
                          {formatStatus(job.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatDeadline(job.filing_deadline, daysRemaining, job.service_type)}
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
            title="No jobs found"
            description={hasActiveFilters 
              ? "No jobs match your current filters. Try adjusting your filters or create a new job."
              : "Create your first job to start tracking client work, deadlines, and workflows."
            }
            actionLabel="Create Job"
            onAction={() => setShowCreateDialog(true)}
          />
        )}
      </div>

      <CreateJobDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </DashboardLayout>
  );
}
