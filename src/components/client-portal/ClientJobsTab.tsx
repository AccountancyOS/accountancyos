import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Briefcase, ExternalLink, Plus } from "lucide-react";
import { differenceInDays } from "date-fns";
import { formatDate, formatServiceType, formatStatus } from "@/lib/format-utils";
import CreateJobDialog from "@/components/jobs/CreateJobDialog";

interface ClientJobsTabProps {
  clientId: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
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

function getDeadlineThresholdDays(serviceType: string | null): number {
  if (!serviceType) return 14;
  const st = serviceType.toLowerCase();
  if (["accounts", "company_accounts", "self_assessment", "sa", "sa_mtd", "sa_non_mtd", "corporation_tax", "ct600", "advisory"].includes(st)) return 30;
  if (["vat", "vat_return", "payroll", "cis", "company_sec", "cs01", "confirmation_statement"].includes(st)) return 7;
  return 14;
}

function renderDeadline(deadline: string | null, serviceType: string | null) {
  if (!deadline) return <span className="text-muted-foreground text-sm">No Deadline</span>;
  const days = differenceInDays(new Date(deadline), new Date());
  const threshold = getDeadlineThresholdDays(serviceType);
  if (days < 0) return <span className="text-destructive font-medium">{Math.abs(days)} Days Overdue</span>;
  if (days === 0) return <span className="text-destructive font-medium">Due Today</span>;
  if (days <= threshold) return <span className="text-amber-600 font-medium">{formatDate(deadline, "dayMonthYear")} ({days}d)</span>;
  return <span>{formatDate(deadline, "dayMonthYear")}</span>;
}

export default function ClientJobsTab({ clientId }: ClientJobsTabProps) {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const [showCreate, setShowCreate] = useState(false);

  const { data: jobs, isLoading, error, refetch } = useQuery({
    queryKey: ["client-jobs", clientId, organization?.id],
    queryFn: async () => {
      const query = supabase
        .from("jobs")
        .select("id, job_name, service_type, status, period_label, filing_deadline, assigned_to, is_auto_generated, created_at")
        .eq("client_id", clientId)
        .order("filing_deadline", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      const { data, error } = organization?.id
        ? await query.eq("organization_id", organization.id)
        : await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>Failed To Load Jobs. Please Try Again.</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Jobs</CardTitle>
              <CardDescription>
                All work scheduled for this client. Jobs are generated automatically when a quote is accepted, based on the selected services and their statutory deadlines.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate(`/jobs?client=${clientId}`)}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View All In Jobs
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Job
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {jobs && jobs.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job Name</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Filing Deadline</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow
                  key={job.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/jobs/${job.id}`)}
                >
                  <TableCell className="font-medium">{job.job_name}</TableCell>
                  <TableCell>{formatServiceType(job.service_type)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{job.period_label || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[job.status] || "outline"}>
                      {formatStatus(job.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{renderDeadline(job.filing_deadline, job.service_type)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {job.is_auto_generated ? "Auto" : "Manual"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Briefcase className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">No Jobs Yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Jobs appear here automatically once a quote is accepted. You can also create one manually for ad-hoc work.
              </p>
            </div>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Job
            </Button>
          </CardContent>
        </Card>
      )}

      <CreateJobDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
