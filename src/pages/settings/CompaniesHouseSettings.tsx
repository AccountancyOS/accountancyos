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
import { 
  ArrowLeft, 
  Loader2, 
  Building, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Key,
  Save,
  TestTube
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { toast } from "sonner";
import { format } from "date-fns";

export default function CompaniesHouseSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const [apiKey, setApiKey] = useState("");
  const [presenterId, setPresenterId] = useState("");
  const [presenterEmail, setPresenterEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [hasApiKeyEntered, setHasApiKeyEntered] = useState(false);

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
        setPresenterEmail(data.presenter_email || "");
      }
      
      return data;
    },
    enabled: !!organization?.id,
  });

  // Save API key mutation (via edge function for encryption)
  const saveApiKeyMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");

      const { data, error } = await supabase.functions.invoke("integrations-save-ch-key", {
        body: {
          organization_id: organization.id,
          api_key: apiKey,
          presenter_id: presenterId,
          presenter_email: presenterEmail,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      toast.success("API key saved securely");
      setApiKey("");
      setHasApiKeyEntered(false);
      queryClient.invalidateQueries({ queryKey: ["organization-ch"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  // Save presenter details only
  const savePresenterMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");

      const { error } = await supabase
        .from("organization_integrations_companies_house")
        .upsert({
          organization_id: organization.id,
          presenter_id: presenterId,
          presenter_email: presenterEmail,
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

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");

      const { data, error } = await supabase.functions.invoke("integrations-test-ch-key", {
        body: { organization_id: organization.id },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Connection successful!");
      } else {
        toast.error(`Connection failed: ${data.error || "Unknown error"}`);
      }
      queryClient.invalidateQueries({ queryKey: ["organization-ch"] });
    },
    onError: (error: Error) => {
      toast.error(`Test failed: ${error.message}`);
    },
  });

  const handleSaveApiKey = async () => {
    setIsSaving(true);
    try {
      await saveApiKeyMutation.mutateAsync();
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      await testConnectionMutation.mutateAsync();
    } finally {
      setIsTesting(false);
    }
  };

  const getConnectionStatus = () => {
    if (!chData?.api_key_encrypted) {
      return { status: "not_configured", label: "Not Configured", color: "secondary" as const, icon: XCircle };
    }

    if (chData.last_test_success === true) {
      return { status: "connected", label: "Connected", color: "default" as const, icon: CheckCircle2 };
    }

    if (chData.last_test_success === false) {
      return { status: "error", label: "Connection Error", color: "destructive" as const, icon: AlertCircle };
    }

    return { status: "unknown", label: "Not Tested", color: "secondary" as const, icon: AlertCircle };
  };

  const connectionStatus = getConnectionStatus();
  const StatusIcon = connectionStatus.icon;

  // Mask API key display
  const getMaskedKey = () => {
    if (hasApiKeyEntered && apiKey) {
      return apiKey;
    }
    if (chData?.api_key_encrypted) {
      return "••••••••••••••••";
    }
    return "";
  };

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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Companies House</h1>
            <p className="text-muted-foreground">
              Configure API credentials for company filings
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
                    API connection for submitting company filings
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {chData?.connected_at && (
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <p className="text-muted-foreground">First Connected</p>
                  <p className="font-medium">
                    {format(new Date(chData.connected_at), "dd MMM yyyy, HH:mm")}
                  </p>
                </div>
                {chData.last_test_at && (
                  <div>
                    <p className="text-muted-foreground">Last Tested</p>
                    <p className="font-medium">
                      {format(new Date(chData.last_test_at), "dd MMM yyyy, HH:mm")}
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {chData?.api_key_encrypted && (
              <Button 
                variant="outline" 
                onClick={handleTestConnection}
                disabled={isTesting}
              >
                {isTesting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <TestTube className="mr-2 h-4 w-4" />
                    Test Connection
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* API Key */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Key
            </CardTitle>
            <CardDescription>
              Your Companies House API key is stored securely and encrypted
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api_key">API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="api_key"
                  type={hasApiKeyEntered ? "text" : "password"}
                  value={hasApiKeyEntered ? apiKey : getMaskedKey()}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setHasApiKeyEntered(true);
                  }}
                  onFocus={() => {
                    if (!hasApiKeyEntered) {
                      setApiKey("");
                      setHasApiKeyEntered(true);
                    }
                  }}
                  placeholder={chData?.api_key_encrypted ? "Enter new key to replace" : "Enter your API key"}
                  className="font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Get your API key from the{" "}
                <a 
                  href="https://developer.company-information.service.gov.uk/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Companies House Developer Hub
                </a>
              </p>
            </div>
            
            {hasApiKeyEntered && apiKey && (
              <Button onClick={handleSaveApiKey} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save API Key
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Presenter Details */}
        <Card>
          <CardHeader>
            <CardTitle>Filing Identity</CardTitle>
            <CardDescription>
              Presenter details used when submitting filings to Companies House
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="presenter_id">Presenter ID</Label>
                <Input
                  id="presenter_id"
                  value={presenterId}
                  onChange={(e) => setPresenterId(e.target.value)}
                  placeholder="Your presenter ID"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="presenter_email">Presenter Email</Label>
                <Input
                  id="presenter_email"
                  type="email"
                  value={presenterEmail}
                  onChange={(e) => setPresenterEmail(e.target.value)}
                  placeholder="presenter@example.com"
                />
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={() => savePresenterMutation.mutate()}
              disabled={savePresenterMutation.isPending}
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
      </div>
    </DashboardLayout>
  );
}
