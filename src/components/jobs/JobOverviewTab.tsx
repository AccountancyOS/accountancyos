import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  ListChecks,
  MessageSquare,
  Clock,
  ChevronRight,
} from "lucide-react";
import { formatServiceType, formatStatus, formatRelativeDate } from "@/lib/format-utils";
import { STAGE_LABEL, primaryAction, type JobStatus } from "@/lib/job-workflow-model";
import { deriveNextAction, deriveBlockers, type JobOverviewFacts } from "@/lib/job-overview-model";

interface JobOverviewTabProps {
  jobId: string;
  /** the already-loaded ["job", jobId] row (includes the clients/companies embed). */
  job: any;
  clientName: string;
  clientTypeLabel: string;
  ownerName: string;
  filingDeadlineText: string;
  filingDeadlineColor: string;
  unreadMessagesCount: number;
  sourceJob: { id: string; job_name: string } | null | undefined;
  nextYearJob: { id: string; job_name: string } | null | undefined;
  orgUsers: { id: string; name: string }[] | undefined;
  onNavigateTab: (tab: string) => void;
  /** the Increment-1 primary-action mutation, reused as-is (same onError toast). */
  primaryActionMutation: { mutate: (targetStatus: JobStatus) => void; isPending: boolean };
}

/**
 * Overview tab — the default job-workspace landing view. Summarises the job
 * (next action, blockers, compact document/workpaper/task/conversation/
 * activity summaries + a contextual sidebar) by reusing the SAME query keys
 * as the other tabs (job-documents, job-records-requests, job-questionnaires,
 * job-workpaper, job-tasks, job-conversations, job-timeline, job-filing) so
 * caches are shared rather than re-fetched under a new key. No parallel
 * model — all decision logic here comes from src/lib/job-overview-model.ts,
 * a pure function of already-loaded facts.
 */
export default function JobOverviewTab({
  jobId,
  job,
  clientName,
  clientTypeLabel,
  ownerName,
  filingDeadlineText,
  filingDeadlineColor,
  unreadMessagesCount,
  sourceJob,
  nextYearJob,
  orgUsers,
  onNavigateTab,
  primaryActionMutation,
}: JobOverviewTabProps) {
  const navigate = useNavigate();

  const resolveName = (userId: string | null | undefined) =>
    userId ? orgUsers?.find((u) => u.id === userId)?.name || "…" : null;

  // --- Reused queries (same keys/queryFns as the sibling tab components) ---

  const { data: documents } = useQuery({
    queryKey: ["job-documents", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_documents")
        .select("*")
        .eq("job_id", jobId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: requests } = useQuery({
    queryKey: ["job-records-requests", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select("*")
        .eq("job_id", jobId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: questionnaires } = useQuery({
    queryKey: ["job-questionnaires", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questionnaire_instances")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: workpaper } = useQuery({
    queryKey: ["job-workpaper", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workpaper_instances")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks } = useQuery({
    queryKey: ["job-tasks", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_tasks")
        .select("*")
        .eq("job_id", jobId)
        .order("task_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: conversation } = useQuery({
    queryKey: ["job-conversations", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_conversations")
        .select("*")
        .eq("job_id", jobId)
        .is("task_id", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: timeline } = useQuery({
    queryKey: ["job-timeline", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_timeline")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Filing approval flag — same key/queryFn as JobFilingTab so the two share
  // cache. Not every job has a `requires_filing` capability or a filings
  // row yet; when there's none, clientApprovalRecorded is simply false.
  const { data: filing } = useQuery({
    queryKey: ["job-filing", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("filings")
        .select("*, jobs!filings_job_id_fkey!inner(is_auto_generated, source_job_id)")
        .eq("job_id", jobId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Primary contact for company jobs (companies.primary_contact_person_id -> company_persons).
  const primaryContactPersonId: string | undefined = job.companies?.primary_contact_person_id;
  const { data: primaryContact } = useQuery({
    queryKey: ["job-overview-primary-contact", primaryContactPersonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_persons")
        .select("first_name, last_name, email, phone")
        .eq("id", primaryContactPersonId as string)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!primaryContactPersonId,
  });

  // Portal status, if known — most recent portal_access row for this client/company.
  const portalEntityId: string | undefined = job.client_id || job.company_id;
  const { data: portalAccess } = useQuery({
    queryKey: ["job-overview-portal-access", portalEntityId, !!job.client_id],
    queryFn: async () => {
      let q = supabase
        .from("portal_access")
        .select("status, created_at")
        .order("created_at", { ascending: false })
        .limit(1);
      q = job.client_id ? q.eq("client_id", job.client_id) : q.eq("company_id", job.company_id);
      const { data, error } = await q.maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!portalEntityId,
  });

  // --- Derived facts (plain object) fed into the pure model ---

  const outstandingRequests = (requests || []).filter((r: any) => r.status !== "complete");

  // client_visible=true is the one reliable client-originated signal in the
  // current codebase: the direct client-portal upload path
  // (src/portal/services/portalDocumentsService.ts) always sets it true, and
  // the accountant-side upload tab (JobDocumentsTab) always sets it false.
  // Documents linked in from a submitted questionnaire don't set this flag,
  // so this is an under-count, not a fabricated signal.
  const hasNewClientUploads = (documents || []).some((d: any) => d.client_visible === true);

  const clientApprovalRecorded = !!filing?.approved_at;
  const hasFiling = !!filing;

  const facts: JobOverviewFacts = {
    status: job.status as JobStatus,
    outstandingRequestCount: outstandingRequests.length,
    hasNewClientUploads,
    clientApprovalRecorded,
    hasFiling,
    workpaperStatus: workpaper?.status ?? null,
  };

  const nextAction = deriveNextAction(facts);
  const blockers = deriveBlockers(facts);
  const action = primaryAction(job.status as JobStatus);

  // --- Recent documents & requests (combined, max 5) ---

  const requestItems = outstandingRequests.slice(0, 5).map((r: any) => ({
    id: `req-${r.id}`,
    icon: <ListChecks className="h-4 w-4 text-amber-600 shrink-0" />,
    title: r.title,
    meta: `Outstanding · ${formatStatus(r.status)}`,
  }));
  const remainingSlots = Math.max(0, 5 - requestItems.length);
  const documentItems = (documents || []).slice(0, remainingSlots).map((d: any) => ({
    id: `doc-${d.id}`,
    icon: <FileText className="h-4 w-4 text-muted-foreground shrink-0" />,
    title: d.file_name,
    meta: `Uploaded ${formatRelativeDate(d.uploaded_at)}`,
  }));
  const recentItems = [...requestItems, ...documentItems];

  const questionnaireSubmittedCount = (questionnaires || []).filter((q: any) => q.status === "submitted").length;

  // --- Tasks summary ---

  const openTasks = (tasks || []).filter((t: any) => t.status !== "done");
  const sortedOpenTasks = [...openTasks]
    .sort((a: any, b: any) => {
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return (a.task_order ?? 0) - (b.task_order ?? 0);
    })
    .slice(0, 5);
  const todayKey = format(new Date(), "yyyy-MM-dd");

  // --- Recent conversation (latest 2-3, task_id IS NULL) ---

  const recentMessages = (conversation || []).slice(-3);

  // --- Recent activity ---

  const recentTimeline = (timeline || []).slice(0, 5);

  // --- Side column values ---

  const clientEmail = job.clients?.email || job.companies?.email || primaryContact?.email;
  const clientPhone = job.clients?.phone || job.companies?.phone || primaryContact?.phone;
  const primaryContactName = primaryContact
    ? `${primaryContact.first_name} ${primaryContact.last_name}`
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main column */}
      <div className="lg:col-span-2 space-y-6">
        {/* Next action */}
        <Card>
          <CardHeader>
            <CardTitle>Next action</CardTitle>
          </CardHeader>
          <CardContent>
            {nextAction && action ? (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-medium">{nextAction.label}</p>
                  {nextAction.reason && (
                    <p className="text-sm text-muted-foreground">{nextAction.reason}</p>
                  )}
                </div>
                <Button
                  onClick={() => primaryActionMutation.mutate(action.targetStatus)}
                  disabled={primaryActionMutation.isPending}
                >
                  {nextAction.label}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This job is complete — no further action needed.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Blockers */}
        {blockers.length > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 text-destructive font-medium text-sm mb-1.5">
              <AlertTriangle className="h-4 w-4" />
              Blockers
            </div>
            <ul className="text-sm text-destructive/90 space-y-0.5 list-disc list-inside">
              {blockers.map((b, i) => (
                <li key={i}>{b.message}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Recent documents & requests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Documents & requests</CardTitle>
              {questionnaires && questionnaires.length > 0 && (
                <CardDescription>
                  {questionnaireSubmittedCount} of {questionnaires.length} questionnaires completed
                </CardDescription>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigateTab("documents")}>
              View all documents
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents or requests yet.</p>
            ) : (
              <div className="space-y-2">
                {recentItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 text-sm">
                    {item.icon}
                    <span className="flex-1 min-w-0 truncate">{item.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{item.meta}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Workpaper summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Workpaper</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigateTab("workpaper")}>
              Open workpaper
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {workpaper ? (
              <div className="space-y-1.5 text-sm">
                <Badge variant="secondary">{formatStatus(workpaper.status)}</Badge>
                {workpaper.prepared_by && (
                  <p className="text-muted-foreground">
                    Prepared by {resolveName(workpaper.prepared_by)}
                    {workpaper.prepared_at && ` on ${format(new Date(workpaper.prepared_at), "dd MMM yyyy")}`}
                  </p>
                )}
                {workpaper.reviewed_by && (
                  <p className="text-muted-foreground">
                    Reviewed by {resolveName(workpaper.reviewed_by)}
                    {workpaper.reviewed_at && ` on ${format(new Date(workpaper.reviewed_at), "dd MMM yyyy")}`}
                  </p>
                )}
                {workpaper.updated_at && (
                  <p className="text-muted-foreground">
                    Last edited {formatRelativeDate(workpaper.updated_at)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                No workpaper created yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Tasks summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Tasks</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigateTab("tasks")}>
              View all tasks
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {sortedOpenTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open tasks.</p>
            ) : (
              <div className="space-y-2">
                {sortedOpenTasks.map((task: any) => {
                  const dueKey = task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd") : null;
                  const overdue = dueKey && dueKey < todayKey;
                  const dueToday = dueKey === todayKey;
                  return (
                    <div key={task.id} className="flex items-center gap-3 text-sm">
                      <ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 min-w-0 truncate">{task.title}</span>
                      {task.due_date && (
                        <span
                          className={`text-xs shrink-0 ${
                            overdue ? "text-destructive font-medium" : dueToday ? "text-amber-600 font-medium" : "text-muted-foreground"
                          }`}
                        >
                          {overdue ? "Overdue" : dueToday ? "Due today" : `Due ${format(new Date(task.due_date), "dd MMM")}`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent conversation */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Conversation</CardTitle>
              {unreadMessagesCount > 0 && (
                <CardDescription>{unreadMessagesCount} unread from client</CardDescription>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigateTab("conversation")}>
              Open conversation
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              <div className="space-y-2">
                {recentMessages.map((msg: any) => (
                  <div key={msg.id} className="flex items-start gap-3 text-sm">
                    <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {msg.sender_type === "accountant" ? "You" : "Client"} ·{" "}
                        {formatRelativeDate(msg.created_at)}
                      </p>
                      <p className="truncate">{msg.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent activity</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigateTab("timeline")}>
              View full timeline
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentTimeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="space-y-2">
                {recentTimeline.map((event: any) => (
                  <div key={event.id} className="flex items-center gap-3 text-sm">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{event.event_type}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelativeDate(event.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Side column */}
      <div className="space-y-6">
        {/* Job details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Job details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <SidebarRow label="Type" value={formatServiceType(job.service_type)} />
            {job.period_label && <SidebarRow label="Period" value={job.period_label} />}
            {job.internal_target_date && (
              <SidebarRow label="Due date" value={format(new Date(job.internal_target_date), "dd MMM yyyy")} />
            )}
            {job.filing_deadline && (
              <SidebarRow
                label="Filing deadline"
                value={<span className={filingDeadlineColor}>{filingDeadlineText}</span>}
              />
            )}
            <SidebarRow label="Owner" value={ownerName} />
            <SidebarRow label="Stage" value={STAGE_LABEL[job.status as JobStatus]} />
            {job.created_at && (
              <SidebarRow label="Created" value={format(new Date(job.created_at), "dd MMM yyyy")} />
            )}
          </CardContent>
        </Card>

        {/* Client details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <SidebarRow label="Client" value={clientName} />
            <SidebarRow label="Type" value={clientTypeLabel} />
            {primaryContactName && <SidebarRow label="Primary contact" value={primaryContactName} />}
            {clientEmail && <SidebarRow label="Email" value={clientEmail} />}
            {clientPhone && <SidebarRow label="Phone" value={clientPhone} />}
            {portalAccess?.status && (
              <SidebarRow label="Portal" value={formatStatus(portalAccess.status)} />
            )}
          </CardContent>
        </Card>

        {/* Related work */}
        {(sourceJob || nextYearJob) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Related work</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sourceJob && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between"
                  onClick={() => navigate(`/jobs/${sourceJob.id}`)}
                >
                  Previous period: {sourceJob.job_name}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
              {nextYearJob && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between"
                  onClick={() => navigate(`/jobs/${nextYearJob.id}`)}
                >
                  Next period: {nextYearJob.job_name}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function SidebarRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
