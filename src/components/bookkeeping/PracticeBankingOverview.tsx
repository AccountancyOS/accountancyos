import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Building2, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useOrganization } from "@/lib/organization-context";
import {
  useOrgBankConnectionHealth,
  type OrgBankConnectionHealth,
} from "@/hooks/useBankConnectionHealth";

const STATUS_LABEL: Record<OrgBankConnectionHealth["derived_status"], string> = {
  connected: "Connected",
  expiring_soon: "Expiring Soon",
  expired: "Expired",
  disconnected: "Disconnected",
  sync_failed: "Sync Failed",
  action_required: "Action Required",
};

const STATUS_VARIANT: Record<OrgBankConnectionHealth["derived_status"], "default" | "secondary" | "destructive" | "outline"> = {
  connected: "secondary",
  expiring_soon: "outline",
  expired: "destructive",
  disconnected: "destructive",
  sync_failed: "destructive",
  action_required: "outline",
};

export function PracticeBankingOverview() {
  const { organization } = useOrganization();
  const { data, isLoading } = useOrgBankConnectionHealth(organization?.id);

  const rows = data ?? [];
  const unhealthy = rows.filter((r) => r.derived_status !== "connected");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="h-5 w-5" /> Practice Banking Health
        </CardTitle>
        <div className="text-sm text-muted-foreground">
          {rows.length} connection{rows.length === 1 ? "" : "s"}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No bank connections across the practice yet.
          </p>
        ) : (
          <>
            {unhealthy.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{unhealthy.length} Connection{unhealthy.length === 1 ? "" : "s"} Need Attention</AlertTitle>
                <AlertDescription>
                  Review the rows below and reconnect or retry sync.
                </AlertDescription>
              </Alert>
            )}
            <div className="divide-y rounded-md border">
              {rows.map((row) => (
                <div key={row.connection_id} className="flex items-center justify-between gap-4 p-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{row.bank_name || row.provider || "Bank"}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.account_count} account{row.account_count === 1 ? "" : "s"}
                      {row.last_synced_at && ` · Last sync ${formatDistanceToNow(new Date(row.last_synced_at), { addSuffix: true })}`}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[row.derived_status]}>
                    {STATUS_LABEL[row.derived_status]}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}