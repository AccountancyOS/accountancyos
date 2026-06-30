import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { usePortalEntity } from "../../contexts/PortalEntityContext";
import { usePortalBookkeepingPermissions } from "../../hooks/usePortalBookkeepingPermissions";

/**
 * Shown on the portal bookkeeping overview when the accountant has flagged
 * one or more VAT returns as needing client approval before submission to
 * HMRC. Approval is recorded via the `portal_approve_vat_return` RPC, which
 * checks `allow_vat_approval` permission and stamps `client_approved_at`.
 */
export function PortalVATApprovalPanel() {
  const { currentEntity } = usePortalEntity();
  const { data: perms } = usePortalBookkeepingPermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const entityCol = currentEntity?.type === "client" ? "client_id" : "company_id";
  const queryKey = ["portal-vat-pending-approval", currentEntity?.type, currentEntity?.id];

  const { data: pending = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!currentEntity) return [];
      const { data, error } = await supabase
        .from("vat_returns")
        .select("id, period_start, period_end, box_3_total_vat_due, box_5_net_vat, client_approval_required, client_approved_at")
        .eq(entityCol, currentEntity.id)
        .eq("client_approval_required", true)
        .is("client_approved_at", null)
        .order("period_end", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentEntity && !!perms?.allowVATApproval,
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("portal_approve_vat_return", { _vat_return_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "VAT Return Approved", description: "Your accountant can now submit to HMRC." });
    },
    onError: (e: any) => {
      toast({ title: "Approval Failed", description: e.message, variant: "destructive" });
    },
  });

  if (!perms?.allowVATApproval || pending.length === 0) return null;

  const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-600" /> VAT Returns Awaiting Your Approval
        </CardTitle>
        <CardDescription>
          Review and approve these VAT returns so your accountant can submit them to HMRC.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.map((vr: any) => (
          <div key={vr.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">
                Period {fmt(vr.period_start)} – {fmt(vr.period_end)}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">Net VAT Due £{Number(vr.box_5_net_vat ?? vr.box_3_total_vat_due ?? 0).toFixed(2)}</Badge>
                <span>Approval requested by your accountant</span>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => approve.mutate(vr.id)}
              disabled={approve.isPending}
            >
              {approve.isPending ? "Approving..." : "Approve"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}