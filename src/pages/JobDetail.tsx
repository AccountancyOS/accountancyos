import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ExternalLink, RefreshCw, ChevronRight } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import JobTasksTab from "@/components/jobs/JobTasksTab";
import JobConversationTab from "@/components/jobs/JobConversationTab";
import JobDocumentsTab from "@/components/jobs/JobDocumentsTab";
import JobTimelineTab from "@/components/jobs/JobTimelineTab";
import JobSettingsTab from "@/components/jobs/JobSettingsTab";
import { JobQuestionnaireTab } from "@/components/jobs/JobQuestionnaireTab";
import { JobWorkpaperTab } from "@/components/jobs/JobWorkpaperTab";
import { JobFilingTab } from "@/components/jobs/JobFilingTab";
import { JobPipelineOverview } from "@/components/jobs/JobPipelineOverview";
import { JobAuditTrail } from "@/components/jobs/JobAuditTrail";
import { toast } from "sonner";
import { useState } from "react";

export default function JobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("pipeline");

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(`
          *,
          clients (id, first_name, last_name, email),
          companies (id, company_name, email)
        `)
        .eq("id", jobId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });

  // Fetch source job name if this is auto-generated
  const { data: sourceJob } = useQuery({
    queryKey: ["source-job", job?.source_job_id],
    queryFn: async () => {
      if (!job?.source_job_id) return null;
      const { data, error } = await supabase
        .from("jobs")
        .select("id, job_name")
        .eq("id", job.source_job_id)
        .single();

      if (error) return null;
      return data;
    },
    enabled: !!job?.source_job_id,
  });

  // Fetch next year job if it exists via filing
  const { data: nextYearJob } = useQuery({
    queryKey: ["next-year-job", jobId],
    queryFn: async () => {
      const { data: filing } = await supabase
        .from("filings")
        .select("next_year_job_id")
        .eq("job_id", jobId)
        .maybeSingle();

      if (!filing?.next_year_job_id) return null;

      const { data, error } = await supabase
        .from("jobs")
        .select("id, job_name")
        .eq("id", filing.next_year_job_id)
        .single();

      if (error) return null;
      return data;
    },
    enabled: !!jobId,
  });

  const markCompleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          progress: 100,
        })
        .eq("id", jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      toast.success("Job marked as completed");
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading job...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <p className="text-muted-foreground">Job not found</p>
          <Button onClick={() => navigate("/jobs")}>Back to Jobs</Button>
        </div>
      </DashboardLayout>
    );
  }

  const clientName = job.clients
    ? `${job.clients.first_name} ${job.clients.last_name}`
    : job.companies?.company_name || "Unknown";

  const daysRemaining = job.filing_deadline
    ? differenceInDays(new Date(job.filing_deadline), new Date())
    : null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate("/jobs")}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Jobs
        </Button>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold">{job.job_name}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                Client:{" "}
                <button
                  onClick={() => navigate(`/clients/${job.client_id || job.company_id}`)}
                  className="text-foreground hover:underline"
                >
                  {clientName}
                </button>
              </span>
              <span>•</span>
              <span>{job.service_type}</span>
              <span>•</span>
              <span>{job.period_label || format(new Date(job.period_end || new Date()), "MMM yyyy")}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/clients/${job.client_id || job.company_id}`)}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View Client Portal
            </Button>
            {job.status !== "completed" && (
              <Button onClick={() => markCompleteMutation.mutate()}>
                Mark Complete
              </Button>
            )}
          </div>
        </div>

        {/* Auto-generated indicator */}
        {job.is_auto_generated && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
            <RefreshCw className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium text-primary">Auto-generated Job</p>
              <p className="text-xs text-muted-foreground">
                Created automatically from previous year's filing
              </p>
            </div>
            {sourceJob && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate(`/jobs/${sourceJob.id}`)}
              >
                Source: {sourceJob.job_name}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}

        {/* Next year job indicator */}
        {nextYearJob && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
            <ChevronRight className="h-5 w-5 text-emerald-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-600">Next Year Job Created</p>
              <p className="text-xs text-muted-foreground">
                Auto-rollover completed after filing
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate(`/jobs/${nextYearJob.id}`)}
            >
              {nextYearJob.job_name}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Status Bar */}
        <div className="flex items-center gap-6 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge>{job.status.replace(/_/g, " ")}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Priority:</span>
            <Badge>{job.priority}</Badge>
          </div>
          {job.filing_deadline && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Filing Deadline:</span>
              <span className="font-medium">
                {format(new Date(job.filing_deadline), "dd MMM yyyy")}
                {daysRemaining !== null && (
                  <span className={daysRemaining < 7 ? "text-destructive ml-2" : "text-muted-foreground ml-2"}>
                    ({daysRemaining < 0 ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days remaining`})
                  </span>
                )}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">Progress:</span>
            <div className="flex items-center gap-2">
              <div className="w-32 bg-background rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              <span className="text-sm font-medium">{job.progress}%</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="questionnaire">Questionnaire</TabsTrigger>
            <TabsTrigger value="workpaper">Workpaper</TabsTrigger>
            <TabsTrigger value="filing">Filing</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="conversation">Conversation</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline">
            <div className="space-y-6">
              <JobPipelineOverview jobId={job.id} onNavigate={setActiveTab} />
              <JobAuditTrail jobId={job.id} />
            </div>
          </TabsContent>

          <TabsContent value="questionnaire">
            <JobQuestionnaireTab 
              jobId={job.id}
              clientId={job.client_id || undefined}
              companyId={job.company_id || undefined}
            />
          </TabsContent>

          <TabsContent value="workpaper">
            <JobWorkpaperTab jobId={job.id} />
          </TabsContent>

          <TabsContent value="filing">
            <JobFilingTab jobId={job.id} />
          </TabsContent>

          <TabsContent value="tasks">
            <JobTasksTab jobId={job.id} />
          </TabsContent>

          <TabsContent value="conversation">
            <JobConversationTab jobId={job.id} />
          </TabsContent>

          <TabsContent value="documents">
            <JobDocumentsTab jobId={job.id} />
          </TabsContent>

          <TabsContent value="timeline">
            <JobTimelineTab jobId={job.id} />
          </TabsContent>

          <TabsContent value="settings">
            <JobSettingsTab job={job} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
