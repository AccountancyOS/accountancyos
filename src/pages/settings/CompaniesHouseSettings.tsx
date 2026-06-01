import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { 
  ArrowLeft, 
  Loader2, 
  Building, 
  CheckCircle2, 
  AlertCircle,
  Save,
  Shield,
  User,
  Mail
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatStatus } from "@/lib/format-utils";
import { PermissionGuard } from "@/components/ui/permission-guard";
import { getFilingSubmissions } from "@/lib/ch-filing-service";

export default function CompaniesHouseSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const [presenterId, setPresenterId] = useState("");
  const [presenterName, setPresenterName] = useState("");
  const [presenterEmail, setPresenterEmail] = useState("");
  const [optInBusy, setOptInBusy] = useState(false);

  // Fetch CH integration data
  const { data: chData, isLoading } = useQuery({
    queryKey: ["organization-ch", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;

      const { data, error } = await supabase
        .from("organization_integrations_companies_house")
        .select("*")
        .eq("organization_id", organization.id)
        .maybeSingle();

      if (error) throw error;
      
      // Pre-fill presenter fields
      if (data) {
        setPresenterId(data.presenter_id || "");
        setPresenterName(data.presenter_name || "");
        setPresenterEmail(data.presenter_email || "");
      }
      
      return data;
    },
    enabled: !!organization?.id,
  });

  // Fetch recent filing submissions
  const { data: recentSubmissions } = useQuery({
    queryKey: ["ch-submissions", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      return getFilingSubmissions(organization.id, { limit: 5 });
    },
    enabled: !!organization?.id,
  });

  // Save presenter details
  const savePresenterMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");

      const { error } = await supabase
        .from("organization_integrations_companies_house")
        .upsert({
          organization_id: organization.id,
          presenter_id: presenterId,
          presenter_name: presenterName,
          presenter_email: presenterEmail,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Presenter details saved");
      queryClient.invalidateQueries({ queryKey: ["organization-ch"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  const optInEnabled = !!chData?.ch_sync_opt_in;

  const toggleOptIn = async (next: boolean) => {
    if (!organization?.id) return;
    setOptInBusy(true);
    const { data: userResp } = await supabase.auth.getUser();
    const userId = userResp.user?.id ?? null;
    const { error } = await supabase
      .from("organization_integrations_companies_house")
      .upsert({
        organization_id: organization.id,
        ch_sync_opt_in: next,
        ch_sync_opt_in_at: next ? new Date().toISOString() : null,
        ch_sync_opt_in_by: next ? userId : null,
        updated_at: new Date().toISOString(),
      });
    setOptInBusy(false);
    if (error) {
      toast.error(`Failed to update sync opt-in: ${error.message}`);
      return;
    }
    toast.success(next ? "Companies House Sync Enabled" : "Companies House Sync Paused");
    queryClient.invalidateQueries({ queryKey: ["organization-ch"] });
  };

  const getConnectionStatus = () => {
    const hasPresenter = !!chData?.presenter_id && !!chData?.presenter_email;
    
    if (!hasPresenter) {
      return { 
        status: "not_configured", 
        label: "Presenter Not Configured", 
        color: "secondary" as const, 
        icon: AlertCircle 
      };
    }

    return { 
      status: "configured", 
      label: "Ready", 
      color: "default" as const, 
      icon: CheckCircle2 
    };
  };

  const connectionStatus = getConnectionStatus();
  const StatusIcon = connectionStatus.icon;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PermissionGuard permission="can_manage_integrations" title="Companies House Settings">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Companies House</h1>
              <p className="text-muted-foreground">
                Configure filing settings for company submissions
              </p>
            </div>
          </div>

          <Separator />

          {/* Connection Status */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Building className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Connection Status
                      <Badge variant={connectionStatus.color}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {connectionStatus.label}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Companies House filing integration
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Managed by AccountancyOS</p>
                  <p className="text-sm text-muted-foreground">
                    Companies House API credentials are managed centrally by AccountancyOS. 
                    You only need to configure your presenter details below.
                  </p>
                </div>
              </div>

              {chData?.updated_at && (
                <div className="text-sm text-muted-foreground">
                  Last updated: {format(new Date(chData.updated_at), "dd MMM yyyy, HH:mm")}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Presenter Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Presenter Details
              </CardTitle>
              <CardDescription>
                Your practice's filing identity for Companies House submissions. 
                These details are used when submitting filings on behalf of your clients.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="presenter_id">Presenter ID *</Label>
                  <Input
                    id="presenter_id"
                    value={presenterId}
                    onChange={(e) => setPresenterId(e.target.value)}
                    placeholder="Your Companies House presenter ID"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your unique presenter ID from Companies House
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="presenter_name">Presenter Name</Label>
                  <Input
                    id="presenter_name"
                    value={presenterName}
                    onChange={(e) => setPresenterName(e.target.value)}
                    placeholder="Your name or firm name"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="presenter_email">Presenter Email *</Label>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <Input
                    id="presenter_email"
                    type="email"
                    value={presenterEmail}
                    onChange={(e) => setPresenterEmail(e.target.value)}
                    placeholder="presenter@yourfirm.com"
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Email address for filing notifications from Companies House
                </p>
              </div>

              <Button 
                onClick={() => savePresenterMutation.mutate()}
                disabled={savePresenterMutation.isPending || !presenterId || !presenterEmail}
              >
                {savePresenterMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Presenter Details
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Recent Submissions */}
          {recentSubmissions && recentSubmissions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Filing Submissions</CardTitle>
                <CardDescription>
                  Latest submissions to Companies House from your practice
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentSubmissions.map((submission: any) => (
                    <div 
                      key={submission.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{submission.filing_type}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(submission.submitted_at), "dd MMM yyyy, HH:mm")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={submission.environment === 'production' ? 'default' : 'secondary'}>
                          {submission.environment}
                        </Badge>
                        <Badge variant={
                          submission.status === 'accepted' ? 'default' :
                          submission.status === 'rejected' ? 'destructive' :
                          submission.status === 'error' ? 'destructive' :
                          'secondary'
                        }>
                          {formatStatus(submission.status)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </PermissionGuard>
    </DashboardLayout>
  );
}
