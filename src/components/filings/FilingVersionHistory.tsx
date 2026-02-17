import { useQuery } from "@tanstack/react-query";
import { getFilingVersionHistory } from "@/lib/filing-version-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Lock, FileCheck, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface FilingVersionHistoryProps {
  filingId: string;
  currentSnapshotId?: string | null;
}

export function FilingVersionHistory({ filingId, currentSnapshotId }: FilingVersionHistoryProps) {
  const { data: versions, isLoading } = useQuery({
    queryKey: ["filing-versions", filingId],
    queryFn: () => getFilingVersionHistory(filingId),
    enabled: !!filingId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No versions created yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4" />
          Version History
          <Badge variant="secondary" className="ml-auto">{versions.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-3">
            {versions.map((v: any) => (
              <div
                key={v.id}
                className={`p-3 rounded-lg border text-sm ${
                  v.id === currentSnapshotId ? "border-primary bg-primary/5" : "bg-card"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={v.id === currentSnapshotId ? "default" : "outline"} className="text-xs">
                      v{v.version}
                    </Badge>
                    {v.id === currentSnapshotId && (
                      <Badge variant="secondary" className="text-xs">
                        <FileCheck className="h-3 w-3 mr-1" />
                        Current
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(v.created_at), "d MMM yyyy HH:mm")}
                  </span>
                </div>
                {v.lock_reason && (
                  <div className="flex items-start gap-1.5 mt-1.5">
                    <Lock className="h-3 w-3 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">{v.lock_reason}</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                  Hash: {v.snapshot_hash?.slice(0, 16)}…
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
