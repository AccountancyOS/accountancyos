import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  FileSpreadsheet, 
  ClipboardCheck, 
  FileCheck, 
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle
} from "lucide-react";
import { format } from "date-fns";
import { formatStatus, formatServiceType } from "@/lib/format-utils";

interface JobPipelineOverviewProps {
  jobId: string;
  onNavigate: (tab: string) => void;
}

export function JobPipelineOverview({ jobId, onNavigate }: JobPipelineOverviewProps) {
  // Fetch TB snapshot status
  const { data: tbSnapshot } = useQuery({
    queryKey: ["job-tb-snapshot", jobId],
    queryFn: async () => {
      const { data } = await supabase
        .from("trial_balance_snapshots")
        .select("id, status, locked, snapshot_date, source_type, is_balanced")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Fetch workpaper status
  const { data: workpaper } = useQuery({
    queryKey: ["job-workpaper", jobId],
    queryFn: async () => {
      const { data } = await supabase
        .from("workpaper_instances")
        .select("id, status, locked, service_type, created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Fetch filing status
  const { data: filing } = useQuery({
    queryKey: ["job-filing-status", jobId],
    queryFn: async () => {
      const { data } = await supabase
        .from("filings")
        .select("id, status, is_locked, filing_type, created_at")
        .eq("job_id", jobId)
        .maybeSingle();
      return data;
    },
  });

  const getStatusIcon = (status: string | undefined, locked?: boolean) => {
    if (locked || status === "filed" || status === "finalised") {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (status === "rejected") {
      return <XCircle className="h-4 w-4 text-destructive" />;
    }
    if (status === "awaiting_approval" || status === "ready_for_review" || status === "in_review") {
      return <Clock className="h-4 w-4 text-yellow-500" />;
    }
    if (status === "draft" || status === "in_progress") {
      return <AlertCircle className="h-4 w-4 text-blue-500" />;
    }
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusBadgeColor = (status: string | undefined) => {
    if (!status) return "bg-muted text-muted-foreground";
    const colors: Record<string, string> = {
      draft: "bg-muted text-muted-foreground",
      in_progress: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      ready_for_review: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
      in_review: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
      finalised: "bg-green-500/10 text-green-600 border-green-500/20",
      awaiting_approval: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
      approved: "bg-green-500/10 text-green-600 border-green-500/20",
      ready_to_file: "bg-green-500/10 text-green-600 border-green-500/20",
      filed: "bg-green-600 text-white",
      rejected: "bg-destructive/10 text-destructive border-destructive/20",
    };
    return colors[status] || "bg-muted text-muted-foreground";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pipeline Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          {/* Trial Balance */}
          <div 
            className="flex-1 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
            onClick={() => onNavigate("workpaper")}
          >
            <div className="flex items-center gap-2 mb-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Trial Balance</span>
            </div>
            {tbSnapshot ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {getStatusIcon(tbSnapshot.status, tbSnapshot.locked)}
                  <Badge variant="outline" className={`text-xs ${getStatusBadgeColor(tbSnapshot.status)}`}>
                    {tbSnapshot.locked ? "Locked" : formatStatus(tbSnapshot.status)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {tbSnapshot.source_type} • {format(new Date(tbSnapshot.snapshot_date), "d MMM")}
                </p>
                {!tbSnapshot.is_balanced && (
                  <p className="text-xs text-destructive">Unbalanced</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No snapshot</p>
            )}
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />

          {/* Workpaper */}
          <div 
            className="flex-1 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
            onClick={() => onNavigate("workpaper")}
          >
            <div className="flex items-center gap-2 mb-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Workpaper</span>
            </div>
            {workpaper ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {getStatusIcon(workpaper.status, workpaper.locked)}
                  <Badge variant="outline" className={`text-xs ${getStatusBadgeColor(workpaper.status)}`}>
                    {workpaper.locked ? "Locked" : formatStatus(workpaper.status)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatServiceType(workpaper.service_type)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Not created</p>
            )}
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />

          {/* Filing */}
          <div 
            className="flex-1 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
            onClick={() => onNavigate("filing")}
          >
            <div className="flex items-center gap-2 mb-2">
              <FileCheck className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filing</span>
            </div>
            {filing ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {getStatusIcon(filing.status, filing.is_locked)}
                  <Badge variant="outline" className={`text-xs ${getStatusBadgeColor(filing.status)}`}>
                    {formatStatus(filing.status)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {filing.filing_type}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Not created</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
