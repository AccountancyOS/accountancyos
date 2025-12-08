import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Loader2, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Clock,
  AlertTriangle,
  ExternalLink,
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PermissionGuard } from "@/components/ui/permission-guard";

export default function HMRCSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const [isConnecting, setIsConnecting] = useState(false);

  // Fetch HMRC integration data
  const { data: hmrcData, isLoading } = useQuery({
    queryKey: ["organization-hmrc", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;

      const { data, error } = await supabase
        .from("organization_integrations_hmrc")
        .select("*")
        .eq("organization_id", organization.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  // Update test mode mutation
  const updateTestModeMutation = useMutation({
    mutationFn: async (testMode: boolean) => {
      if (!organization?.id) throw new Error("No organization");

      const { error } = await supabase
        .from("organization_integrations_hmrc")
        .upsert({
          organization_id: organization.id,
          test_mode: testMode,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Test mode updated");
      queryClient.invalidateQueries({ queryKey: ["organization-hmrc"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  // Disconnect MTD VAT mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");

      const { error } = await supabase
        .from("organization_integrations_hmrc")
        .update({
          mtd_vat_connected: false,
          mtd_vat_access_token_encrypted: null,
          mtd_vat_refresh_token_encrypted: null,
          mtd_vat_expires_at: null,
        })
        .eq("organization_id", organization.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("HMRC disconnected");
      queryClient.invalidateQueries({ queryKey: ["organization-hmrc"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to disconnect: ${error.message}`);
    },
  });

  // Connect to HMRC OAuth
  const handleConnectHMRC = async () => {
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("hmrc-auth", {
        body: { redirect_url: window.location.origin },
      });

      if (error) throw error;

      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else if (data.error) {
        toast.error(data.error);
      }
    } catch (error: any) {
      toast.error(`Failed to initiate HMRC connection: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const getConnectionStatus = () => {
    if (!hmrcData?.mtd_vat_connected) {
      return { status: "disconnected", label: "Not Connected", color: "secondary" as const };
    }

    if (hmrcData.mtd_vat_expires_at) {
      const expiresAt = new Date(hmrcData.mtd_vat_expires_at);
      if (expiresAt < new Date()) {
        return { status: "expired", label: "Expired", color: "destructive" as const };
      }
    }

    return { status: "connected", label: "Connected", color: "default" as const };
  };

  const connectionStatus = getConnectionStatus();

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
      <PermissionGuard permission="can_manage_integrations" title="HMRC Integration">
        <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">HMRC Integration</h1>
            <p className="text-muted-foreground">
              Connect to HMRC for MTD VAT, PAYE, and Self Assessment
            </p>
          </div>
        </div>

        <Separator />

        {/* Test Mode Banner */}
        {(hmrcData?.test_mode ?? true) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div className="flex-1">
              <p className="font-medium text-amber-800">Sandbox Mode Enabled</p>
              <p className="text-sm text-amber-700">
                All HMRC connections will use the test/sandbox environment. Toggle off for production.
              </p>
            </div>
          </div>
        )}

        {/* MTD VAT */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    MTD for VAT
                    <Badge variant={connectionStatus.color}>
                      {connectionStatus.status === "connected" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {connectionStatus.status === "expired" && <Clock className="h-3 w-3 mr-1" />}
                      {connectionStatus.status === "disconnected" && <XCircle className="h-3 w-3 mr-1" />}
                      {connectionStatus.label}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Submit VAT returns and view obligations via Making Tax Digital
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {hmrcData?.mtd_vat_connected ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Connected At</p>
                    <p className="font-medium">
                      {hmrcData.mtd_vat_connected_at
                        ? format(new Date(hmrcData.mtd_vat_connected_at), "dd MMM yyyy, HH:mm")
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Token Expires</p>
                    <p className="font-medium">
                      {hmrcData.mtd_vat_expires_at
                        ? format(new Date(hmrcData.mtd_vat_expires_at), "dd MMM yyyy, HH:mm")
                        : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleConnectHMRC} disabled={isConnecting}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isConnecting ? "animate-spin" : ""}`} />
                    Reconnect
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">Disconnect</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect HMRC?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove the connection to HMRC. You will need to reconnect to submit VAT returns.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => disconnectMutation.mutate()}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ) : (
              <Button onClick={handleConnectHMRC} disabled={isConnecting}>
                {isConnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Connect to HMRC
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* PAYE / RTI / CIS */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  PAYE / RTI / CIS
                  <Badge variant="secondary">
                    {hmrcData?.paye_connected ? "Connected" : "Not Connected"}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Submit payroll RTI returns and CIS payments
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              PAYE and CIS submissions will use the same HMRC credentials as MTD VAT once connected.
              RTI submissions are sent automatically when payroll is processed.
            </p>
          </CardContent>
        </Card>

        {/* Self Assessment */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Self Assessment
                  <Badge variant="secondary">
                    {hmrcData?.sa_connected ? "Connected" : "Not Connected"}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Submit SA100 returns for individuals
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Self Assessment integration requires agent authorisation via HMRC. 
              This will be available in a future update.
            </p>
          </CardContent>
        </Card>

        {/* Corporation Tax */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Corporation Tax
                  <Badge variant="secondary">
                    {hmrcData?.ct_connected ? "Connected" : "Not Connected"}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Submit CT600 returns for companies
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Corporation Tax integration will be available when HMRC opens the CT600 API.
            </p>
          </CardContent>
        </Card>

        {/* Test Mode Toggle */}
        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
            <CardDescription>
              Choose whether to use HMRC sandbox or production
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="test-mode">Sandbox / Test Mode</Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, all HMRC calls use the sandbox environment
                </p>
              </div>
              <Switch
                id="test-mode"
                checked={hmrcData?.test_mode ?? true}
                onCheckedChange={(checked) => updateTestModeMutation.mutate(checked)}
              />
            </div>
          </CardContent>
        </Card>
        </div>
      </PermissionGuard>
    </DashboardLayout>
  );
}
