import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, ExternalLink, AlertTriangle } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

type DeadlineFilters = {
  search: string;
  clientId: string;
  deadlineType: string;
  filingBody: string;
  status: string;
  riskLevel: string;
  ownerId: string;
  timeHorizon: string;
};

interface DeadlinesTableProps {
  filters: DeadlineFilters;
}

export const DeadlinesTable = ({ filters }: DeadlinesTableProps) => {
  const { organization } = useOrganization();

  const { data: deadlines, isLoading } = useQuery({
    queryKey: ["deadlines", organization?.id, filters],
    queryFn: async () => {
      if (!organization?.id) return [];

      let query = supabase
        .from("deadlines")
        .select(`
          *,
          clients (first_name, last_name),
          companies (company_name),
          jobs (job_name, status)
        `)
        .eq("organization_id", organization.id)
        .order("due_date", { ascending: true });

      // Apply filters
      if (filters.clientId) query = query.eq("client_id", filters.clientId);
      if (filters.deadlineType) query = query.eq("deadline_type", filters.deadlineType);
      if (filters.filingBody) query = query.eq("filing_body", filters.filingBody);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);

      const { data, error } = await query;
      if (error) throw error;

      // Apply time horizon filter
      const now = new Date();
      let filteredData = data || [];

      if (filters.timeHorizon === "overdue") {
        filteredData = filteredData.filter((d) => new Date(d.due_date) < now && d.status !== "completed");
      } else if (filters.timeHorizon === "this_week") {
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        filteredData = filteredData.filter((d) => new Date(d.due_date) <= weekFromNow);
      } else if (filters.timeHorizon === "this_month") {
        const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        filteredData = filteredData.filter((d) => new Date(d.due_date) <= monthFromNow);
      }

      // Apply risk level filter
      if (filters.riskLevel === "high") {
        filteredData = filteredData.filter((d) => d.risk_score >= 70);
      }

      // Apply search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredData = filteredData.filter(
          (d) =>
            d.name.toLowerCase().includes(searchLower) ||
            (d.clients && `${d.clients.first_name} ${d.clients.last_name}`.toLowerCase().includes(searchLower)) ||
            (d.companies && d.companies.company_name.toLowerCase().includes(searchLower))
        );
      }

      return filteredData;
    },
    enabled: !!organization?.id,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
      case "filed":
        return "default";
      case "overdue":
        return "destructive";
      case "in_progress":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return "text-destructive";
    if (score >= 40) return "text-amber-500";
    return "text-green-500";
  };

  const getDaysRemainingColor = (daysRemaining: number) => {
    if (daysRemaining < 0) return "text-destructive";
    if (daysRemaining <= 7) return "text-amber-500";
    return "text-muted-foreground";
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-12">Loading deadlines...</div>;
  }

  if (!deadlines?.length) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No deadlines found</h3>
        <p className="text-muted-foreground">
          {filters.search || Object.values(filters).some((v) => v && v !== "all")
            ? "Try adjusting your filters"
            : "Create your first deadline to get started"}
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr className="border-b">
            <th className="text-left p-3 font-medium">Client/Company</th>
            <th className="text-left p-3 font-medium">Deadline</th>
            <th className="text-left p-3 font-medium">Type</th>
            <th className="text-left p-3 font-medium">Filing Body</th>
            <th className="text-left p-3 font-medium">Due Date</th>
            <th className="text-left p-3 font-medium">Days Remaining</th>
            <th className="text-left p-3 font-medium">Status</th>
            <th className="text-left p-3 font-medium">Risk</th>
            <th className="text-left p-3 font-medium">Job</th>
          </tr>
        </thead>
        <tbody>
          {deadlines.map((deadline) => {
            const dueDate = new Date(deadline.due_date);
            const daysRemaining = differenceInDays(dueDate, new Date());
            const clientName = deadline.clients
              ? `${deadline.clients.first_name} ${deadline.clients.last_name}`
              : deadline.companies?.company_name || "—";

            return (
              <tr key={deadline.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="p-3 font-medium">{clientName}</td>
                <td className="p-3">
                  <div>
                    <div className="font-medium">{deadline.name}</div>
                    {deadline.period_start && deadline.period_end && (
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(deadline.period_start), "MMM yyyy")} -{" "}
                        {format(new Date(deadline.period_end), "MMM yyyy")}
                      </div>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <Badge variant="outline" className="capitalize">
                    {deadline.deadline_type}
                  </Badge>
                </td>
                <td className="p-3 text-sm">{deadline.filing_body || "—"}</td>
                <td className="p-3">{format(dueDate, "dd MMM yyyy")}</td>
                <td className="p-3">
                  <span className={cn("font-medium", getDaysRemainingColor(daysRemaining))}>
                    {daysRemaining < 0 ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days`}
                  </span>
                </td>
                <td className="p-3">
                  <Badge variant={getStatusColor(deadline.status)} className="capitalize">
                    {deadline.status.replace("_", " ")}
                  </Badge>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {deadline.risk_score >= 70 && <AlertTriangle className="h-4 w-4 text-destructive" />}
                    <span className={cn("font-medium", getRiskColor(deadline.risk_score))}>
                      {deadline.risk_score}
                    </span>
                  </div>
                </td>
                <td className="p-3">
                  {deadline.jobs ? (
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/jobs/${deadline.job_id}`} className="flex items-center gap-1">
                        {deadline.jobs.job_name}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
