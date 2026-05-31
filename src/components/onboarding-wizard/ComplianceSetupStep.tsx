import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck, Building, ExternalLink } from "lucide-react";
import {
  clearWizardDraft,
  loadWizardDraft,
  useWizardDraft,
} from "./useWizardDraft";

interface ComplianceSetupStepProps {
  organizationId: string;
  onComplete: () => void;
  onSkip: () => void;
}

const STEP_KEY = "compliance_setup";

type ComplianceForm = {
  hmrcLabel: string;
  companiesHouseLabel: string;
};

const DEFAULT_FORM: ComplianceForm = { hmrcLabel: "", companiesHouseLabel: "" };

export const ComplianceSetupStep = ({ organizationId, onComplete, onSkip }: ComplianceSetupStepProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const initial =
    loadWizardDraft<ComplianceForm>(STEP_KEY, organizationId) ?? DEFAULT_FORM;
  const [hmrcLabel, setHmrcLabel] = useState(initial.hmrcLabel);
  const [companiesHouseLabel, setCompaniesHouseLabel] = useState(
    initial.companiesHouseLabel,
  );

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("external_credentials")
        .select("service_type, credential_label")
        .eq("organization_id", organizationId)
        .in("service_type", ["hmrc_gateway", "companies_house"]);
      if (cancelled || !data) return;
      const hmrc = data.find((r) => r.service_type === "hmrc_gateway");
      const ch = data.find((r) => r.service_type === "companies_house");
      setHmrcLabel((curr) => curr || hmrc?.credential_label || "");
      setCompaniesHouseLabel((curr) => curr || ch?.credential_label || "");
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useWizardDraft<ComplianceForm>(STEP_KEY, organizationId, {
    hmrcLabel,
    companiesHouseLabel,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const credentials = [];

      if (hmrcLabel) {
        credentials.push({
          organization_id: organizationId,
          service_type: "hmrc_gateway",
          credential_label: hmrcLabel,
          metadata: { configured: true },
        });
      }

      if (companiesHouseLabel) {
        credentials.push({
          organization_id: organizationId,
          service_type: "companies_house",
          credential_label: companiesHouseLabel,
          metadata: { configured: true },
        });
      }

      if (credentials.length > 0) {
        const { error } = await supabase
          .from("external_credentials")
          .insert(credentials);

        if (error) throw error;

        toast({
          title: "Credentials saved",
          description: "Your compliance setup has been saved.",
        });
      }

      clearWizardDraft(STEP_KEY, organizationId);
      onComplete();
    } catch (error: any) {
      toast({
        title: "Error saving credentials",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">HMRC Government Gateway</CardTitle>
            </div>
            <CardDescription>
              Store a reference label for your HMRC credentials (not the actual password)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hmrc_label">Credential Label</Label>
              <Input
                id="hmrc_label"
                value={hmrcLabel}
                onChange={(e) => setHmrcLabel(e.target.value)}
                placeholder="e.g., Main HMRC Account"
              />
              <p className="text-xs text-muted-foreground">
                This is just a label to help you identify which credentials to use
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate("/settings/hmrc")}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Configure HMRC in Settings
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Companies House</CardTitle>
            </div>
            <CardDescription>
              Store a reference label for your Companies House API credentials
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ch_label">Credential Label</Label>
              <Input
                id="ch_label"
                value={companiesHouseLabel}
                onChange={(e) => setCompaniesHouseLabel(e.target.value)}
                placeholder="e.g., Main Companies House Account"
              />
              <p className="text-xs text-muted-foreground">
                This is just a label to help you identify which credentials to use
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate("/settings/companies-house")}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Configure Companies House in Settings
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save & Continue"
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onSkip}>
          I'll configure this later
        </Button>
      </div>
    </form>
  );
};
