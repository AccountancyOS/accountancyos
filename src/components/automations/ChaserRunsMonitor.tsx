/**
 * ChaserRunsMonitor: Shows active/stopped/paused chaser runs.
 * Replaces the workflow instances monitor for chaser functionality.
 */

import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Activity, CheckCircle2, PauseCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

interface ChaserRun {
  id: string;
  job_id: string;
  status: string;
  next_send_at: string | null;
  last_sent_at: string | null;
  send_count: number;
  frequency_unit: string;
  frequency_interval: number;
  period_end: string | null;
  jobs: { job_name: string; client_id: string | null; company_id: string | null; service_type: string } | null;
  automation_chaser_policies: { name: string; service_code: string } | null;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  ACTIVE: <Activity className="h-4 w-4 text-green-500" />,
  STOPPED: <XCircle className="h-4 w-4 text-muted-foreground" />,
  PAUSED: <PauseCircle className="h-4 w-4 text-yellow-500" />,
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ACTIVE: "default",
  STOPPED: "secondary",
  PAUSED: "outline",
};

export function ChaserRunsMonitor() {
  const { organization } = useOrganization();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: runs, isLoading } = useQuery({
    queryKey: ["chaser-runs", organization?.id, statusFilter],
    queryFn: async () => {
      if (!organization?.id) return [];
      let query = supabase
        .from("automation_chaser_runs")
        .select(`
          id, job_id, status, next_send_at, last_sent_at, send_count,
          frequency_unit, frequency_interval, period_end,
          jobs(job_name, client_id, company_id, service_type),
          automation_chaser_policies(name, service_code)
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as ChaserRun[];
    },
    enabled: !!organization?.id,
  });

  // Stats
  const activeCount = runs?.filter((r) => r.status === "ACTIVE").length || 0;
  const stoppedCount = runs?.filter((r) => r.status === "STOPPED").length || 0;
  const pausedCount = runs?.filter((r) => r.status === "PAUSED").length || 0;

  return (
    <div className="space-y-4 mt-4">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer" onClick={() => setStatusFilter("ACTIVE")}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-semibold">{activeCount}</p>
              </div>
              <Activity className="h-8 w-8 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setStatusFilter("PAUSED")}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Paused</p>
                <p className="text-2xl font-semibold">{pausedCount}</p>
              </div>
              <PauseCircle className="h-8 w-8 text-yellow-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setStatusFilter("STOPPED")}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Stopped</p>
                <p className="text-2xl font-semibold">{stoppedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="STOPPED">Stopped</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Chaser Runs ({runs?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !runs || runs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No chaser runs found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Send</TableHead>
                  <TableHead>Last Sent</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium text-sm">
                          {run.automation_chaser_policies?.name || "—"}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {run.automation_chaser_policies?.service_code}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {run.jobs?.job_name || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {STATUS_ICONS[run.status]}
                        <Badge variant={STATUS_VARIANTS[run.status] || "secondary"} className="text-xs">
                          {run.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {run.next_send_at
                        ? format(new Date(run.next_send_at), "dd MMM yyyy HH:mm")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {run.last_sent_at
                        ? format(new Date(run.last_sent_at), "dd MMM HH:mm")
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {run.send_count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
