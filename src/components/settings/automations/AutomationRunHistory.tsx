import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Pause, Play, X, ChevronRight, AlertCircle, FlaskConical } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";

type WorkflowRow = {
  id: string;
  org_id: string;
  template_id: string;
  client_id: string | null;
  company_id: string | null;
  period_key: string;
  status: string;
  current_step_id: string | null;
  next_run_at: string | null;
  waiting_for_event_key: string | null;
  retry_count: number | null;
  last_error: string | null;
  dead_lettered_at: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  automation_workflow_templates: { name: string; service_type: string | null } | null;
};

type ChaserRow = {
  id: string;
  organization_id: string;
  policy_id: string;
  status: string;
  subject_type: string | null;
  subject_id: string | null;
  send_count: number;
  next_send_at: string | null;
  last_sent_at: string | null;
  trigger_date: string;
  created_at: string;
  updated_at: string;
  automation_chaser_policies: { name: string; category: string | null } | null;
};

const WF_STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  running: "default",
  waiting: "secondary",
  completed: "outline",
  failed: "destructive",
  cancelled: "outline",
};

export function AutomationRunHistory() {
  const { organization } = useOrganization();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"workflows" | "chasers">("workflows");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<WorkflowRow | null>(null);

  const { data: workflows, isLoading: wfLoading } = useQuery({
    queryKey: ["automation-run-history", "workflows", organization?.id, statusFilter],
    queryFn: async () => {
      if (!organization?.id) return [];
      let q = supabase
        .from("automation_workflow_instances")
        .select(`
          id, org_id, template_id, client_id, company_id, period_key, status,
          current_step_id, next_run_at, waiting_for_event_key, retry_count, last_error,
          dead_lettered_at, paused_at, cancelled_at, error_message, created_at, updated_at,
          automation_workflow_templates ( name, service_type )
        `)
        .eq("org_id", organization.id)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (statusFilter === "dead_lettered") q = q.not("dead_lettered_at", "is", null);
      else if (statusFilter === "paused") q = q.not("paused_at", "is", null);
      else if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as WorkflowRow[];
    },
    enabled: !!organization?.id && tab === "workflows",
  });

  const { data: chasers, isLoading: chLoading } = useQuery({
    queryKey: ["automation-run-history", "chasers", organization?.id, statusFilter],
    queryFn: async () => {
      if (!organization?.id) return [];
      let q = supabase
        .from("automation_chaser_runs")
        .select(`
          id, organization_id, policy_id, status, subject_type, subject_id,
          send_count, next_send_at, last_sent_at, trigger_date, created_at, updated_at,
          automation_chaser_policies ( name, category )
        `)
        .eq("organization_id", organization.id)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (statusFilter !== "all" && statusFilter !== "dead_lettered" && statusFilter !== "paused") {
        q = q.eq("status", statusFilter);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as ChaserRow[];
    },
    enabled: !!organization?.id && tab === "chasers",
  });

  const controlMutation = useMutation({
    mutationFn: async ({ instanceId, action }: { instanceId: string; action: "pause" | "resume" | "cancel" }) => {
      const fn = action === "pause" ? "pause_workflow_instance" : action === "resume" ? "resume_workflow_instance" : "cancel_workflow_instance";
      const { error } = await supabase.rpc(fn as "pause_workflow_instance" | "resume_workflow_instance" | "cancel_workflow_instance", { p_instance_id: instanceId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-run-history"] });
      toast.success("Action applied");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Action failed"),
  });

  const filteredWorkflows = (workflows || []).filter((w) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      w.automation_workflow_templates?.name?.toLowerCase().includes(s) ||
      w.last_error?.toLowerCase().includes(s) ||
      w.period_key.toLowerCase().includes(s)
    );
  });

  const filteredChasers = (chasers || []).filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.automation_chaser_policies?.name?.toLowerCase().includes(s) || c.subject_type?.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run History</CardTitle>
          <CardDescription>
            Live view of every chaser run and workflow instance, with retry state, errors, and controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
              <Button size="sm" variant={tab === "workflows" ? "secondary" : "ghost"} onClick={() => setTab("workflows")}>
                Workflows
              </Button>
              <Button size="sm" variant={tab === "chasers" ? "secondary" : "ghost"} onClick={() => setTab("chasers")}>
                Chasers
              </Button>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="waiting">Waiting</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                {tab === "workflows" && <SelectItem value="paused">Paused</SelectItem>}
                {tab === "workflows" && <SelectItem value="dead_lettered">Dead-lettered</SelectItem>}
              </SelectContent>
            </Select>
            <Input
              placeholder="Search name, error, period…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {tab === "workflows" ? (
            wfLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : filteredWorkflows.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No workflow instances match these filters.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Next Run</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWorkflows.map((w) => {
                    const isPaused = !!w.paused_at;
                    const isCancelled = !!w.cancelled_at;
                    const isDead = !!w.dead_lettered_at;
                    return (
                      <TableRow key={w.id} className="cursor-pointer" onClick={() => setSelected(w)}>
                        <TableCell className="font-medium">
                          {w.automation_workflow_templates?.name ?? "Unknown"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{w.period_key}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={WF_STATUS_VARIANTS[w.status] ?? "outline"} className="text-xs">
                              {isDead ? "Dead-lettered" : isPaused ? "Paused" : isCancelled ? "Cancelled" : w.status}
                            </Badge>
                            {w.last_error && (
                              <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-label={w.last_error} />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{w.retry_count ?? 0}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {w.next_run_at ? format(new Date(w.next_run_at), "dd MMM HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(w.updated_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {!isDead && !isCancelled && (
                            <div className="inline-flex gap-1">
                              {isPaused ? (
                                <Button size="sm" variant="ghost" onClick={() => controlMutation.mutate({ instanceId: w.id, action: "resume" })}>
                                  <Play className="h-3.5 w-3.5" />
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" onClick={() => controlMutation.mutate({ instanceId: w.id, action: "pause" })}>
                                  <Pause className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => controlMutation.mutate({ instanceId: w.id, action: "cancel" })}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => runDryRun("workflow_template", w.template_id, w.client_id, w.company_id)}>
                                <FlaskConical className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                          <ChevronRight className="inline h-4 w-4 text-muted-foreground ml-1" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )
          ) : chLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filteredChasers.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No chaser runs match these filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sends</TableHead>
                  <TableHead>Next Send</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Test</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChasers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.automation_chaser_policies?.name ?? "Unknown"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.subject_type ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{c.send_count}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.next_send_at ? format(new Date(c.next_send_at), "dd MMM HH:mm") : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => runDryRun("chaser_policy", c.policy_id, null, null)}>
                        <FlaskConical className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RunDetailDialog instance={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

async function runDryRun(mode: "chaser_policy" | "workflow_template", id: string, clientId: string | null, companyId: string | null) {
  try {
    const payload: Record<string, unknown> = { mode };
    if (mode === "chaser_policy") payload.policy_id = id;
    else payload.template_id = id;
    if (clientId) payload.client_id = clientId;
    if (companyId) payload.company_id = companyId;
    const { data, error } = await supabase.functions.invoke("automation-dry-run", { body: payload });
    if (error) throw error;
    toast.success("Dry-run plan generated", {
      description: `${(data as { plan?: unknown[] }).plan?.length ?? "—"} step(s) would run. See console for full plan.`,
    });
    console.log("[Automation Dry-Run]", data);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Dry-run failed");
  }
}

function RunDetailDialog({ instance, onClose }: { instance: WorkflowRow | null; onClose: () => void }) {
  const { data: events } = useQuery({
    queryKey: ["workflow-events", instance?.id],
    queryFn: async () => {
      if (!instance) return [];
      const { data, error } = await supabase
        .from("automation_workflow_events")
        .select("id, event_type, payload, created_at, step_id")
        .eq("instance_id", instance.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!instance,
  });

  return (
    <Dialog open={!!instance} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{instance?.automation_workflow_templates?.name ?? "Workflow Instance"}</DialogTitle>
          <DialogDescription>
            Period {instance?.period_key} · Status {instance?.status}
            {instance?.retry_count ? ` · ${instance.retry_count} retries` : ""}
          </DialogDescription>
        </DialogHeader>
        {instance?.last_error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <span className="font-medium">Last Error:</span> {instance.last_error}
          </div>
        )}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Event Timeline</h4>
          {(events || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(events || []).map((e) => (
                <li key={e.id} className="border-l-2 pl-3 py-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{e.event_type}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(e.created_at), "dd MMM HH:mm:ss")}
                    </span>
                  </div>
                  <pre className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}