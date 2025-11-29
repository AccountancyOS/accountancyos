import { useQuery } from "@tanstack/react-query";
import { getEntityAuditTrail, AuditLogEntry } from "@/lib/audit-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FileSpreadsheet, 
  ClipboardCheck, 
  FileCheck, 
  Edit,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  Send,
  Plus
} from "lucide-react";
import { format } from "date-fns";

interface JobAuditTrailProps {
  jobId: string;
}

export function JobAuditTrail({ jobId }: JobAuditTrailProps) {
  const { data: auditLog, isLoading } = useQuery({
    queryKey: ["job-audit-trail", jobId],
    queryFn: () => getEntityAuditTrail(jobId),
  });

  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case "trial_balance_snapshot":
        return <FileSpreadsheet className="h-4 w-4" />;
      case "workpaper_instance":
        return <ClipboardCheck className="h-4 w-4" />;
      case "filing":
        return <FileCheck className="h-4 w-4" />;
      default:
        return <Edit className="h-4 w-4" />;
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "create":
        return <Plus className="h-3 w-3 text-green-500" />;
      case "finalise":
        return <Lock className="h-3 w-3 text-green-500" />;
      case "reopen":
        return <Unlock className="h-3 w-3 text-blue-500" />;
      case "approve":
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case "reject":
        return <XCircle className="h-3 w-3 text-destructive" />;
      case "file":
        return <Send className="h-3 w-3 text-green-500" />;
      case "override":
        return <Edit className="h-3 w-3 text-yellow-500" />;
      default:
        return <Edit className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getEntityLabel = (entityType: string) => {
    switch (entityType) {
      case "trial_balance_snapshot":
        return "TB";
      case "workpaper_instance":
        return "Workpaper";
      case "filing":
        return "Filing";
      default:
        return entityType;
    }
  };

  const formatAuditEntry = (entry: AuditLogEntry) => {
    if (entry.action === "override" && entry.field_name) {
      return (
        <span>
          Changed <span className="font-medium">{entry.field_name}</span>
          {entry.old_value && entry.new_value && (
            <span className="text-muted-foreground">
              {" "}from {entry.old_value} to {entry.new_value}
            </span>
          )}
        </span>
      );
    }
    
    const actionLabels: Record<string, string> = {
      create: "Created",
      update: "Updated",
      finalise: "Finalised",
      reopen: "Reopened",
      approve: "Approved",
      reject: "Rejected",
      file: "Filed",
      override: "Modified",
    };
    
    return actionLabels[entry.action] || entry.action;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Trail</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audit Trail</CardTitle>
      </CardHeader>
      <CardContent>
        {!auditLog || auditLog.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No audit entries yet
          </p>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-3">
              {auditLog.map((entry) => (
                <div 
                  key={entry.id} 
                  className="flex items-start gap-3 pb-3 border-b last:border-0"
                >
                  <div className="flex-shrink-0 mt-0.5 p-1.5 rounded-full bg-muted">
                    {getEntityIcon(entry.entity_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {getEntityLabel(entry.entity_type)}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs">
                        {getActionIcon(entry.action)}
                        <span className="capitalize">{entry.action}</span>
                      </span>
                      {entry.metadata?.level && (
                        <Badge variant="secondary" className="text-xs">
                          {String(entry.metadata.level)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm mt-1">
                      {formatAuditEntry(entry)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(entry.created_at), "d MMM yyyy HH:mm")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
