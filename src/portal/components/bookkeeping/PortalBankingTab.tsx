import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Building2, Plus } from "lucide-react";
import { BankingTab } from "@/components/bookkeeping/BankingTab";
import { ConnectBankDialog } from "@/components/bookkeeping/ConnectBankDialog";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PortalBankHealthBanner } from "./PortalBankHealthBanner";
import type { BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";

interface Props {
  entity: BookkeepingEntity;
  allowBankConnect: boolean;
}

/**
 * Thin portal wrapper around the shared BankingTab. Adds:
 *  - A "Connect Bank Account (Open Banking)" CTA above the accountant content
 *    so portal users can initiate a TrueLayer connection.
 *  - Handling for the `?connection=success|error` query param the
 *    truelayer-callback edge function redirects back with.
 */
export function PortalBankingTab({ entity, allowBankConnect }: Props) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  useEffect(() => {
    const connection = searchParams.get("connection");
    if (!connection) return;
    if (connection === "success") {
      toast.success("Bank Connected", { description: "Importing transactions in the background." });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
    } else if (connection === "error") {
      const reason = searchParams.get("message") || "Please try again.";
      toast.error("Bank Connection Failed", { description: reason });
    }
    const next = new URLSearchParams(searchParams);
    next.delete("connection");
    next.delete("entity");
    next.delete("message");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, queryClient]);

  return (
    <div className="space-y-4">
      <PortalBankHealthBanner entity={entity} onReconnect={() => setConnectOpen(true)} />

      {allowBankConnect && (
        <div className="flex items-center justify-between rounded-lg border bg-card p-4">
          <div className="flex items-start gap-3">
            <Building2 className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-sm">Connect a Bank Account via Open Banking</p>
              <p className="text-sm text-muted-foreground">
                Authorise your bank to import transactions automatically. Read-only access only, regulated by the FCA.
              </p>
            </div>
          </div>
          <Button onClick={() => setConnectOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Connect Bank
          </Button>
        </div>
      )}

      {/* The shared accountant BankingTab assumes accountant app-context; contain any
          crash here so it can't take down the whole portal, and surface the error. */}
      <ErrorBoundary>
        <BankingTab entity={entity} />
      </ErrorBoundary>

      <ConnectBankDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        entity={entity}
        redirectPath="/portal/bookkeeping?tab=banking"
      />
    </div>
  );
}