import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { format, isPast, addDays } from "date-fns";
import { Shield, AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";

interface HmrcAuthorisationPanelProps {
  clientId?: string;
  companyId?: string;
}

const AUTH_TYPE_LABELS: Record<string, string> = {
  personal: "Personal (SA)",
  company: "Company (CT)",
  paye: "PAYE",
  vat: "VAT",
};

export function HmrcAuthorisationPanel({ clientId, companyId }: HmrcAuthorisationPanelProps) {
  const { organization } = useOrganization();

  const { data: authorisations, isLoading } = useQuery({
    queryKey: ["hmrc-authorisations", clientId, companyId],
    queryFn: async () => {
      if (!organization?.id) return [];
      let query = supabase
        .from("hmrc_authorisations")
        .select("*")
        .eq("organization_id", organization.id);

      if (clientId) query = query.eq("client_id", clientId);
      if (companyId) query = query.eq("company_id", companyId);

      const { data, error } = await query.order("auth_type");
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id && (!!clientId || !!companyId),
  });

  const getStatusBadge = (status: string, expiresAt: string | null) => {
    if (status === "active" && expiresAt) {
      const expiry = new Date(expiresAt);
      if (isPast(expiry)) {
        return <Badge variant="destructive">Expired</Badge>;
      }
      const warningDate = addDays(new Date(), 30);
      if (expiry < warningDate) {
        return <Badge className="bg-yellow-500 text-white">Expiring Soon</Badge>;
      }
      return <Badge className="bg-green-600 text-white">Active</Badge>;
    }
    if (status === "pending") return <Badge variant="secondary">Pending</Badge>;
    if (status === "expired") return <Badge variant="destructive">Expired</Badge>;
    if (status === "revoked") return <Badge variant="outline">Revoked</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  const getStatusIcon = (status: string, expiresAt: string | null) => {
    if (status === "active" && expiresAt && !isPast(new Date(expiresAt))) {
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    }
    if (status === "pending") return <Clock className="h-4 w-4 text-muted-foreground" />;
    return <AlertTriangle className="h-4 w-4 text-destructive" />;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" />
            HMRC Authorisations
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4" />
          HMRC Authorisations
        </CardTitle>
        <CardDescription>Agent authorisation status for filing</CardDescription>
      </CardHeader>
      <CardContent>
        {authorisations && authorisations.length > 0 ? (
          <div className="space-y-3">
            {authorisations.map((auth) => (
              <div key={auth.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  {getStatusIcon(auth.status, auth.expires_at)}
                  <div>
                    <p className="text-sm font-medium">
                      {AUTH_TYPE_LABELS[auth.auth_type] || auth.auth_type}
                    </p>
                    {auth.reference && (
                      <p className="text-xs text-muted-foreground">Ref: {auth.reference}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(auth.status, auth.expires_at)}
                  {auth.expires_at && (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(auth.expires_at), "dd MMM yyyy")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4">
            <Shield className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No HMRC authorisations recorded</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
