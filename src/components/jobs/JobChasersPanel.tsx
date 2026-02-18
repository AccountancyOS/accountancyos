/**
 * JobChasersPanel: Shows chaser run status and message history for a job.
 * Includes pause/resume, manual start, and audit trail.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  toggleChaserRunPause,
  startChaserRun,
  resolveTriggerDate,
  type ChaserRunStatus,
  type FrequencyUnit,
  type TriggerType,
} from "@/lib/chaser-policy-service";
import {
  Activity, PauseCircle, PlayCircle, StopCircle, Mail, Clock,
  AlertTriangle, Zap,
} from "lucide-react";
import { format } from "date-fns";

interface JobChasersPanelProps {
  jobId: string;
  organizationId: string;
  jobData?: {
    period_start?: string | null;
    period_end?: string | null;
    created_at?: string;
    company_id?: string | null;
    client_id?: string | null;
    status?: string;
  };
}

interface ChaserRun {
  id: string;
  policy_id: string;
  status: string;
  next_send_at: string | null;
  last_sent_at: string | null;
  send_count: number;
  frequency_unit: string;
  frequency_interval: number;
  automation_chaser_policies: {
    name: string;
    service_code: string;
    trigger_type: string;
  } | null;
}

interface ChaserMessage {
  id: string;
  to_email: string;
  rendered_subject: string;
  status: string;
  send_at: string;
  sent_at: string | null;
  failure_reason: string | null;
}

export function JobChasersPanel({ jobId, organizationId, jobData }: JobChasersPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch active chaser runs for this job
  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["job-chaser-runs", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_chaser_runs")
        .select(`
          id, policy_id, status, next_send_at, last_sent_at, send_count,
          frequency_unit, frequency_interval,
          automation_chaser_policies(name, service_code, trigger_type)
        `)
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ChaserRun[];
    },
  });

  // Fetch recent messages
  const { data: messages } = useQuery({
    queryKey: ["job-chaser-messages", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_chaser_messages")
        .select("id, to_email, rendered_subject, status, send_at, sent_at, failure_reason")
        .eq("job_id", jobId)
        .order("send_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as ChaserMessage[];
    },
  });

  // Fetch MANUAL policies that don't have a run for this job
  const { data: manualPolicies } = useQuery({
    queryKey: ["manual-chaser-policies", organizationId, jobId],
    queryFn: async () => {
      const { data: policies, error } = await supabase
        .from("automation_chaser_policies")
        .select("id, name, service_code, trigger_type, frequency_unit, frequency_interval, trigger_offset_days, email_template_id, stop_condition_value")
        .eq("organization_id", organizationId)
        .eq("trigger_type", "MANUAL")
        .eq("is_enabled", true);
      if (error) throw error;
      if (!policies) return [];

      // Filter out policies that already have a run for this job
      const runPolicyIds = new Set((runs || []).map((r) => r.policy_id));
      return policies.filter((p) => !runPolicyIds.has(p.id));
    },
    enabled: !!runs,
  });

  // Pause/Resume mutation
  const pauseMutation = useMutation({
    mutationFn: async ({ runId, currentStatus }: { runId: string; currentStatus: ChaserRunStatus }) => {
      const result = await toggleChaserRunPause(runId, currentStatus);
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-chaser-runs", jobId] });
      toast({ title: "Chaser updated" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Start manual chaser mutation
  const startMutation = useMutation({
    mutationFn: async (policy: any) => {
      const result = await startChaserRun(jobId, policy.id, organizationId, {
        triggerDate: new Date(),
        periodStart: jobData?.period_start,
        periodEnd: jobData?.period_end,
        frequencyUnit: policy.frequency_unit as FrequencyUnit,
        frequencyInterval: policy.frequency_interval,
        emailTemplateId: policy.email_template_id,
        stopConditionValue: policy.stop_condition_value,
        triggerOffsetDays: policy.trigger_offset_days || 0,
      });
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-chaser-runs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["manual-chaser-policies"] });
      toast({ title: "Chaser started" });
    },
    onError: (err) => {
      toast({ title: "Error starting chaser", description: err.message, variant: "destructive" });
    },
  });

  if (runsLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  const hasAnyContent = (runs && runs.length > 0) || (manualPolicies && manualPolicies.length > 0);

  if (!hasAnyContent) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Record Chasers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active runs */}
        {runs && runs.length > 0 && (
          <div className="space-y-3">
            {runs.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  {run.status === "ACTIVE" && <Activity className="h-4 w-4 text-green-500" />}
                  {run.status === "PAUSED" && <PauseCircle className="h-4 w-4 text-yellow-500" />}
                  {run.status === "STOPPED" && <StopCircle className="h-4 w-4 text-muted-foreground" />}
                  <div>
                    <p className="text-sm font-medium">
                      {run.automation_chaser_policies?.name || "Chaser"}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      {run.next_send_at && run.status === "ACTIVE" && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Next: {format(new Date(run.next_send_at), "dd MMM HH:mm")}
                        </span>
                      )}
                      <span>{run.send_count} sent</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={run.status === "ACTIVE" ? "default" : run.status === "PAUSED" ? "outline" : "secondary"}
                    className="text-xs"
                  >
                    {run.status}
                  </Badge>
                  {(run.status === "ACTIVE" || run.status === "PAUSED") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        pauseMutation.mutate({
                          runId: run.id,
                          currentStatus: run.status as ChaserRunStatus,
                        })
                      }
                      disabled={pauseMutation.isPending}
                    >
                      {run.status === "ACTIVE" ? (
                        <PauseCircle className="h-4 w-4" />
                      ) : (
                        <PlayCircle className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Manual start buttons */}
        {manualPolicies && manualPolicies.length > 0 && (
          <div className="space-y-2">
            {manualPolicies.map((policy) => (
              <Button
                key={policy.id}
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => startMutation.mutate(policy)}
                disabled={startMutation.isPending}
              >
                <Zap className="h-4 w-4 mr-2" />
                Start {policy.name}
              </Button>
            ))}
          </div>
        )}

        {/* Message timeline */}
        {messages && messages.length > 0 && (
          <div className="space-y-1 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">Recent reminders</p>
            {messages.map((msg) => (
              <div key={msg.id} className="flex items-center gap-2 text-xs py-1">
                {msg.status === "SENT" && <Mail className="h-3 w-3 text-green-500" />}
                {msg.status === "FAILED" && <AlertTriangle className="h-3 w-3 text-destructive" />}
                {msg.status === "QUEUED" && <Clock className="h-3 w-3 text-muted-foreground" />}
                {msg.status === "CANCELLED" && <StopCircle className="h-3 w-3 text-muted-foreground" />}
                <span className="text-muted-foreground">
                  {format(new Date(msg.send_at), "dd MMM HH:mm")}
                </span>
                <span className="truncate flex-1">{msg.rendered_subject}</span>
                <Badge variant={msg.status === "SENT" ? "default" : msg.status === "FAILED" ? "destructive" : "secondary"} className="text-[10px] px-1.5">
                  {msg.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
