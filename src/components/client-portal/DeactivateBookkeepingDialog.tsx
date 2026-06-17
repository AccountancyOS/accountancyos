import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engagementId: string;
  organizationId: string;
  clientId: string | null;
  companyId: string | null;
  serviceName: string;
  onConfirmed?: () => void;
}

/**
 * Warns the accountant before deactivating a bookkeeping engagement. Explains
 * that the client will lose portal access to bank feeds / invoices / bills,
 * confirms no data is deleted, and logs the action to bookkeeping_audit_log.
 */
export function DeactivateBookkeepingDialog({
  open,
  onOpenChange,
  engagementId,
  organizationId,
  clientId,
  companyId,
  serviceName,
  onConfirmed,
}: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("engagements")
        // engagements_status_check allows draft/active/suspended/terminated.
        .update({ status: "terminated", end_date: new Date().toISOString() })
        .eq("id", engagementId);
      if (error) throw error;

      await supabase.rpc("log_portal_bookkeeping_revocation", {
        _organization_id: organizationId,
        _client_id: clientId,
        _company_id: companyId,
        _reason: reason || null,
      });

      toast({
        title: "Bookkeeping Service Deactivated",
        description:
          "Your client no longer has portal access to the bookkeeping module. All data is preserved.",
      });
      qc.invalidateQueries({ queryKey: ["client-engagements"] });
      qc.invalidateQueries({ queryKey: ["entity-services"] });
      onOpenChange(false);
      onConfirmed?.();
    } catch (e: any) {
      toast({
        title: "Failed to Deactivate",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate {serviceName}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Turning off this service will immediately remove your client's portal
                access to the bookkeeping module, including:
              </p>
              <ul className="list-disc pl-5 text-sm">
                <li>Connected bank feeds and transactions</li>
                <li>Invoices, bills, and credit notes</li>
                <li>Customers, suppliers, and receipts</li>
                <li>Chart of accounts and reports</li>
              </ul>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No Data Will Be Deleted</AlertTitle>
                <AlertDescription>
                  All records are retained. If you reactivate the bookkeeping
                  service later, the client will see everything exactly as they
                  left it.
                </AlertDescription>
              </Alert>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">Reason (Optional)</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Client switching to manual bookkeeping"
            rows={2}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting ? "Deactivating…" : "Deactivate Service"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}