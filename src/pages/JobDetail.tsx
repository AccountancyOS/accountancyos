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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ExternalLink, RefreshCw, ChevronRight, Zap, FileText, AlertTriangle, Undo2, Clock, Layers, Send, CheckCircle2 } from "lucide-react";
import { format, differenceInDays, isFuture } from "date-fns";
import { formatServiceType, formatPriority, formatRelativeDate } from "@/lib/format-utils";
import { getClientTypeLabel } from "@/lib/client-types";
import {
  STAGE_LABEL,
  stepperState,
  primaryAction,
  getAllowedNextStatuses,
  capabilityTabVisible,
} from "@/lib/job-workflow-model";
import { JOB_TASK_STATUSES, CLIENT_TASK_STATUSES } from "@/lib/db-constants/check-constraints";
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
import { ComposeEmailDialog } from "@/components/email/ComposeEmailDialog";
import { rollbackJobGeneration } from "@/lib/job-template-engine";
import { updateJobStatus, type JobStatus } from "@/lib/job-status-service";
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
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(`
          *,
          clients!fk_jobs_client (id, first_name, last_name, email, client_type),
          companies!fk_jobs_company (id, company_name, email, company_type)
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

  // Owner (jobs.assigned_to) display-name resolution — same org-users -> profiles
  // pattern used by StaffAssignmentField (src/components/company/StaffAssignmentField.tsx).
  // Same query key too, so the two share a cache when both are mounted.
  const { data: orgUsers } = useQuery({
    queryKey: ["org-users", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const { data: members, error: membersError } = await supabase
        .from("organization_users")
        .select("user_id, role")
        .eq("organization_id", organization.id);
      if (membersError) throw membersError;
      if (!members || members.length === 0) return [];

      const userIds = members.map((m) => m.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", userIds);
      if (profilesError) throw profilesError;

      const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
      return members.map((m) => {
        const p: any = byId.get(m.user_id);
        const name = p?.first_name && p?.last_name
          ? `${p.first_name} ${p.last_name}`
          : p?.email || m.user_id.slice(0, 8);
        return { id: m.user_id, name };
      });
    },
    enabled: !!organization?.id,
  });

  // Capability gate (canonical_job_templates.requires_*) for tab visibility.
  // Looked up via jobs.canonical_service_code (narrowed by job_template_code
  // when present). FAIL-OPEN: capabilityTabVisible() treats a missing/errored
  // lookup the same as an absent flag — visible unless explicitly false.
  const { data: jobCapabilities } = useQuery({
    queryKey: ["job-template-capabilities", job?.canonical_service_code, job?.job_template_code],
    queryFn: async () => {
      if (!job?.canonical_service_code) return null;
      let query = supabase
        .from("canonical_job_templates")
        .select("requires_questionnaire, requires_workpaper, requires_filing")
        .eq("canonical_service_code", job.canonical_service_code)
        .eq("active", true);
      if (job.job_template_code) {
        query = query.eq("job_template_code", job.job_template_code);
      }
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!job?.canonical_service_code,
  });

  // Job-health strip counts — lightweight, reuse existing table keys.
  const { data: openTasksCount = 0 } = useQuery({
    queryKey: ["job-open-tasks-count", jobId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("job_tasks")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .neq("status", "done" satisfies (typeof JOB_TASK_STATUSES)[number]);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!jobId,
  });

  // client_tasks.status is ("not_started" | "in_progress" | "complete") — NOT
  // "pending" (there is no such value in the client_tasks_status_check
  // constraint). "Outstanding" = anything not yet complete.
  const { data: outstandingRequestsCount = 0 } = useQuery({
    queryKey: ["job-outstanding-requests-count", jobId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("client_tasks")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .neq("status", "complete" satisfies (typeof CLIENT_TASK_STATUSES)[number]);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!jobId,
  });

  // job_conversations has no read-receipt column, so "unread" is a proxy:
  // client-side messages sent after the most recent accountant message (or
  // all client-side messages, if the accountant hasn't replied yet).
  const { data: unreadMessagesCount = 0 } = useQuery({
    queryKey: ["job-unread-messages-count", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_conversations")
        .select("sender_type, created_at")
        .eq("job_id", jobId)
        .is("task_id", null)
        .order("created_at", { ascending: true });
      if (error || !data) return 0;
      let lastAccountantAt: string | null = null;
      for (const m of data) {
        if (m.sender_type === "accountant") lastAccountantAt = m.created_at;
      }
      return data.filter(
        (m) => m.sender_type !== "accountant" && (!lastAccountantAt || m.created_at > lastAccountantAt)
      ).length;
    },
    enabled: !!jobId,
  });

  // State-aware primary action (replaces the old always-shown "Mark Complete").
  // targetStatus always comes from primaryAction(), which is verified by test
  // to only ever return an allowed DB-trigger transition.
  const primaryActionMutation = useMutation({
    mutationFn: async (targetStatus: JobStatus) => {
      if (!jobId) throw new Error("Job ID is required");

      const result = await updateJobStatus(jobId, targetStatus, {
        reason: "Advanced via job workspace primary action",
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to update job status");
      }

      if (targetStatus === "completed") {
        await supabase.from("jobs").update({ progress: 100 }).eq("id", jobId);
      }

      return targetStatus;
    },
    onSuccess: (targetStatus) => {
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      toast.success(`Status updated to ${STAGE_LABEL[targetStatus]}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update job status");
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
    job.status === "blank";

  // Check if template has been updated since job creation
  const templateUpdated = template && jobExtended.template_version &&
    template.version > jobExtended.template_version;

  const clientTypeLabel = getClientTypeLabel(
    job.clients?.client_type || job.companies?.company_type || null
  );

  const ownerName = job.assigned_to
    ? orgUsers?.find((u) => u.id === job.assigned_to)?.name || "…"
    : "Unassigned";

  // Filing-deadline urgency threshold, by service type (unchanged logic — now
  // shared between the header and the health strip instead of living inline
  // in the old status bar).
  const getFilingDeadlineThreshold = (st: string | null): number => {
    if (!st) return 14;
    const s = st.toLowerCase();
    if (["accounts", "company_accounts", "self_assessment", "sa", "corporation_tax", "ct600", "advisory"].includes(s)) return 30;
    if (["vat", "vat_return", "payroll", "cis", "company_sec", "cs01"].includes(s)) return 7;
    return 14;
  };
  const filingThreshold = getFilingDeadlineThreshold(job.service_type);
  const filingDeadlineColor = daysRemaining !== null && daysRemaining < 0
    ? "text-destructive"
    : daysRemaining !== null && daysRemaining <= filingThreshold
    ? "text-amber-600"
    : "text-muted-foreground";
  const filingDeadlineText = job.filing_deadline
    ? `${format(new Date(job.filing_deadline), "dd MMM yyyy")}${
        daysRemaining !== null
          ? ` (${daysRemaining < 0 ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d left`})`
          : ""
      }`
    : "—";

  const action = primaryAction(job.status as JobStatus);
  const allowedNextStatuses = getAllowedNextStatuses(job.status as JobStatus);

  const showQuestionnaireTab = capabilityTabVisible(jobCapabilities?.requires_questionnaire);
  const showWorkpaperTab = capabilityTabVisible(jobCapabilities?.requires_workpaper);
  const showFilingTab = capabilityTabVisible(jobCapabilities?.requires_filing);

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
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{job.job_name}</h1>
              {job.priority && job.priority !== "normal" && (
                <Badge variant="outline" className="text-xs">
                  {formatPriority(job.priority)}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>
                Client:{" "}
                <button
                  onClick={() => navigate(`/clients/${job.client_id || job.company_id}`)}
                  className="text-foreground hover:underline"
                >
                  {clientName}
                </button>{" "}
                ({clientTypeLabel})
              </span>
              <span>•</span>
              <span>{formatServiceType(job.service_type)}</span>
              <span>•</span>
              <span>{job.period_label || format(new Date(job.period_end || new Date()), "MMM yyyy")}</span>
              <span>•</span>
              <span>Owner: {ownerName}</span>
              {job.internal_target_date && (
                <>
                  <span>•</span>
                  <span>Due: {format(new Date(job.internal_target_date), "dd MMM yyyy")}</span>
                </>
              )}
              <span>•</span>
              <span>
                Filing: <span className={filingDeadlineColor}>{filingDeadlineText}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setIsComposeOpen(true)}
            >
              <Send className="mr-2 h-4 w-4" />
              Email Client
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(`/clients/${job.client_id || job.company_id}`)}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View Client Portal
            </Button>
            {action && (
              <Button
                onClick={() => primaryActionMutation.mutate(action.targetStatus)}
                disabled={primaryActionMutation.isPending}
              >
                {action.label}
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

        {/* Auto-generated provenance is intentionally NOT shown to the accountant here — it lives
            in the Timeline tab (JobTimelineTab) for audit history instead of as a banner. */}

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

        {/* Consolidated Workflow — replaces the old separate Status badge + Workflow
            select (both read/wrote the same jobs.status field). */}
        <Card>
          <CardContent className="py-4 px-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Stage:</span>
                <Badge>{STAGE_LABEL[job.status as JobStatus]}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Move to:</span>
                <Select
                  value={job.status}
                  onValueChange={async (value: string) => {
                    const result = await updateJobStatus(job.id, value as JobStatus);
                    if (result.success) {
                      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
                      toast.success(`Status updated to ${STAGE_LABEL[value as JobStatus]}`);
                    } else {
                      toast.error(result.error || "Failed to update status");
                    }
                  }}
                >
                  <SelectTrigger className="w-[220px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={job.status} disabled>
                      {STAGE_LABEL[job.status as JobStatus]} (current)
                    </SelectItem>
                    {allowedNextStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STAGE_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Horizontal stepper */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {stepperState(job.status as JobStatus).map((step, i, arr) => (
                <div key={step.status} className="flex items-center gap-1 flex-shrink-0">
                  <div
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                      step.state === "done"
                        ? "bg-emerald-500/10 text-emerald-700"
                        : step.state === "current"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.state === "done" && <CheckCircle2 className="h-3 w-3" />}
                    {step.label}
                  </div>
                  {i < arr.length - 1 && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Job-health strip — compact, horizontal at-a-glance operational status. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm px-4 py-3 rounded-lg border bg-card">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Filing:</span>
            <span className={`font-medium ${filingDeadlineColor}`}>{filingDeadlineText}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Owner:</span>
            <span className="font-medium">{ownerName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Open tasks:</span>
            <span className={`font-medium ${openTasksCount > 0 ? "text-amber-600" : ""}`}>
              {openTasksCount}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Outstanding requests:</span>
            <span className={`font-medium ${outstandingRequestsCount > 0 ? "text-amber-600" : ""}`}>
              {outstandingRequestsCount}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Unread messages:</span>
            <span className={`font-medium ${unreadMessagesCount > 0 ? "text-amber-600" : ""}`}>
              {unreadMessagesCount}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Last activity:</span>
            <span className="font-medium">{formatRelativeDate(job.last_activity_at)}</span>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="records">Records</TabsTrigger>
            {showQuestionnaireTab && <TabsTrigger value="questionnaire">Questionnaire</TabsTrigger>}
            {showWorkpaperTab && <TabsTrigger value="workpaper">Workpaper</TabsTrigger>}
            {showFilingTab && <TabsTrigger value="filing">Filing</TabsTrigger>}
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
            <JobTimelineTab
              jobId={job.id}
              autoGenerated={
                job.is_auto_generated || jobExtended.auto_generated_at
                  ? { at: jobExtended.auto_generated_at ?? null, reason: jobExtended.generation_reason ?? null }
                  : null
              }
            />
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

      {/* Compose Email Dialog */}
      <ComposeEmailDialog
        open={isComposeOpen}
        onOpenChange={setIsComposeOpen}
        jobId={job?.id}
        clientId={job?.client_id || undefined}
        companyId={job?.company_id || undefined}
        defaultTo={job?.clients?.email || job?.companies?.email}
        defaultToName={clientName}
      />
    </DashboardLayout>
  );
}
