import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppContext } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

const TAX_TYPES = ["SA", "CT", "VAT", "PAYE", "CIS", "MTD_IT", "MTD_VAT", "TRUST", "PARTNERSHIP"];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  authorised: "default",
  requested: "secondary",
  client_authenticating: "secondary",
  code_sent: "secondary",
  rejected: "destructive",
  expired: "destructive",
  revoked: "destructive",
  not_requested: "outline",
};

export function HMRCAuthorisationPanel({ clientId }: { clientId: string }) {
  const { currentOrganization } = useAppContext();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("client_tax_authorisations")
      .select("*")
      .eq("organization_id", currentOrganization.id)
      .eq("client_id", clientId)
      .order("tax_service_type");
    setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientId, currentOrganization?.id]);

  const addAuth = async (tax_service_type: string) => {
    if (!currentOrganization?.id) return;
    const { error } = await supabase.from("client_tax_authorisations").insert({
      organization_id: currentOrganization.id,
      client_id: clientId,
      tax_service_type,
      status: "not_requested",
    });
    if (error) return toast.error(error.message);
    toast.success(`${tax_service_type} authorisation tracked`);
    load();
  };

  const existing = new Set(rows.map((r) => r.tax_service_type));
  const available = TAX_TYPES.filter((t) => !existing.has(t));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">HMRC Authorisations</CardTitle>
        <CardDescription>Agent authorisation status per tax service. Filings are blocked until status is <strong>Authorised</strong>.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>
        ) : (
          <>
            {rows.length === 0 && <p className="text-sm text-muted-foreground">No HMRC authorisations tracked yet.</p>}
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between border rounded-md p-3">
                <div>
                  <div className="font-medium text-sm">{r.tax_service_type}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.reference ? `Ref: ${r.reference} · ` : ""}
                    {r.requested_at ? `Requested ${new Date(r.requested_at).toLocaleDateString()}` : "Not yet requested"}
                    {r.chaser_count > 0 ? ` · ${r.chaser_count} chasers sent` : ""}
                  </div>
                </div>
                <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                  {r.status.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
            {available.length > 0 && (
              <div className="pt-2">
                <div className="text-xs text-muted-foreground mb-2">Add tracking for:</div>
                <div className="flex flex-wrap gap-2">
                  {available.map((t) => (
                    <Button key={t} size="sm" variant="outline" onClick={() => addAuth(t)}>
                      <Plus className="h-3 w-3 mr-1" /> {t}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}