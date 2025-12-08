import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ExternalLink, RefreshCw, ChevronRight, Zap, FileText, AlertTriangle, Undo2, Clock, Layers } from "lucide-react";
import { format, differenceInDays, isFuture } from "date-fns";
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
import { RecordsRequestManager } from "@/components/jobs/RecordsRequestManager";
import { rollbackJobGeneration } from "@/lib/job-template-engine";
import { toast } from "sonner";
import { useState } from "react";

export default function JobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("pipeline");
  const [showUndoDialog, setShowUndoDialog] = useState(false);
  const [undoReason, setUndoReason] = useState("");

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

  // Fetch template info if job has template_id
  const { data: template } = useQuery({
    queryKey: ["job-template-info", job?.template_id],
    queryFn: async () => {
      if (!job?.template_id) return null;
      const { data, error } = await supabase
        .from("job_templates")
        .select("id, template_name, version, is_active")
        .eq("id", job.template_id)
        .single();

      if (error) return null;
      return data;
    },
    enabled: !!job?.template_id,
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

  // Undo job generation mutation
  const undoJobMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !jobId) throw new Error("Missing required data");
      return rollbackJobGeneration(jobId, organization.id, undoReason);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Job generation undone");
        navigate("/jobs");
      } else {
        toast.error(result.error || "Failed to undo job generation");
      }
    },
    onError: (error) => {
      toast.error("Failed to undo job generation");
      console.error(error);
    },
    onSettled: () => {
      setShowUndoDialog(false);
      setUndoReason("");
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

  // Check if undo is available (within 24-hour window and job not started)
  const jobExtended = job as unknown as { 
    can_undo_until?: string; 
    auto_generated_at?: string;
    generation_reason?: string;
    template_version?: number;
  };
  const canUndo = jobExtended.can_undo_until && 
    isFuture(new Date(jobExtended.can_undo_until)) && 
    job.status === "not_started";

  // Check if template has been updated since job creation
  const templateUpdated = template && jobExtended.template_version && 
    template.version > jobExtended.template_version;

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

        {/* Template Metadata */}
        {template && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Layers className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">
                      From Template: {template.template_name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        v{jobExtended.template_version || 1}
                      </Badge>
                      {templateUpdated && (
                        <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-600">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Template updated to v{template.version}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/settings/job-templates")}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  View Template
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Auto-generated indicator with undo */}
        {(job.is_auto_generated || jobExtended.auto_generated_at) && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
            <Zap className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium text-primary">Auto-generated Job</p>
              <p className="text-xs text-muted-foreground">
                {jobExtended.generation_reason || "Created automatically from template"}
                {jobExtended.auto_generated_at && (
                  <> on {format(new Date(jobExtended.auto_generated_at), "dd MMM yyyy 'at' HH:mm")}</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
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
              {canUndo && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUndoDialog(true)}
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  Undo Generation
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Undo window indicator */}
        {canUndo && jobExtended.can_undo_until && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              Undo available until {format(new Date(jobExtended.can_undo_until), "dd MMM yyyy 'at' HH:mm")}
            </span>
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
            <TabsTrigger value="records">Records</TabsTrigger>
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
              <RecordsRequestManager jobId={job.id} mode="accountant" />
              <JobAuditTrail jobId={job.id} />
            </div>
          </TabsContent>

          <TabsContent value="records">
            <RecordsRequestManager jobId={job.id} mode="accountant" />
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

      {/* Undo Confirmation Dialog */}
      <Dialog open={showUndoDialog} onOpenChange={setShowUndoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo Job Generation?</DialogTitle>
            <DialogDescription>
              This will permanently delete this auto-generated job and all its associated tasks. 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason for undoing (required)</label>
              <Textarea
                value={undoReason}
                onChange={(e) => setUndoReason(e.target.value)}
                placeholder="e.g., Created in error, wrong period, etc."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUndoDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => undoJobMutation.mutate()}
              disabled={!undoReason.trim() || undoJobMutation.isPending}
            >
              <Undo2 className="h-4 w-4 mr-2" />
              Undo Generation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
