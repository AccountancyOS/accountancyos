import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useEntityBankConnectionHealth } from "@/hooks/useBankConnectionHealth";
import type { BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";

interface Props {
  entity: BookkeepingEntity;
  onReconnect?: () => void;
}

export function PortalBankHealthBanner({ entity, onReconnect }: Props) {
  const clientId = entity.type === "client" ? entity.id : null;
  const companyId = entity.type === "company" ? entity.id : null;
  const { data, isLoading } = useEntityBankConnectionHealth(clientId, companyId);

  if (isLoading || !data || data.length === 0) return null;

  const issues = data.filter((c) => c.derived_status !== "connected");
  if (issues.length === 0) {
    const latest = data
      .map((c) => c.last_synced_at)
      .filter(Boolean)
      .sort()
      .pop();
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Bank Connected</AlertTitle>
        <AlertDescription>
          {latest
            ? `Last synced ${formatDistanceToNow(new Date(latest), { addSuffix: true })}.`
            : "Awaiting first sync."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      {issues.map((c) => (
        <Alert key={c.connection_id} variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{c.bank_name || "Bank"} — Action Needed</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{c.client_safe_message || "Reconnect required."}</span>
            {onReconnect && (
              <Button size="sm" variant="outline" onClick={onReconnect}>
                <RefreshCw className="h-4 w-4 mr-1" /> Reconnect
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}