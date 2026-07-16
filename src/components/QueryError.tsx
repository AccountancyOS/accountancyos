import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QueryErrorProps {
  /** Optional context, e.g. "jobs" -> "Couldn't load jobs". */
  entity?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Shared error state for data lists. Use this on the `isError` branch of a query so a failed
 * fetch is never rendered as an empty "No X found" state — which could make an accountant
 * believe a client genuinely has no jobs/filings/clients when the request actually failed.
 */
export function QueryError({ entity, message, onRetry, className }: QueryErrorProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center ${className ?? ""}`}
      role="alert"
    >
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <div className="space-y-1">
        <p className="font-medium">Couldn't load {entity ?? "this data"}</p>
        <p className="text-sm text-muted-foreground">
          {message ?? "Something went wrong. This is a loading error, not an empty list."}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
