import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, User, Building2, FileCheck, AlertCircle } from "lucide-react";
import CreateOnboardingDialog from "@/components/onboarding/CreateOnboardingDialog";

interface OnboardingApplication {
  id: string;
  application_type: string;
  status: string;
  aml_status: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  created_at: string;
  lead_id: string | null;
}

const statusColors = {
  pending: "bg-gray-500",
  in_progress: "bg-blue-500",
  aml_review: "bg-yellow-500",
  approved: "bg-green-500",
  rejected: "bg-red-500",
};

const amlColors = {
  pending: "bg-gray-500",
  passed: "bg-green-500",
  failed: "bg-red-500",
  manual_review: "bg-yellow-500",
};

const Onboarding = () => {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<OnboardingApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (organization) {
      loadApplications();
    }
  }, [organization]);

  const loadApplications = async () => {
    try {
      const { data, error } = await supabase
        .from("onboarding_applications")
        .select("*")
        .eq("organization_id", organization!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setApplications(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading applications",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-foreground">
                Onboarding & AML
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage client onboarding applications and compliance checks
              </p>
            </div>
            <CreateOnboardingDialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              onSuccess={loadApplications}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {applications.map((app) => (
              <Card
                key={app.id}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/onboarding/${app.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {app.application_type === "individual" ? (
                        <User className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <CardTitle className="text-base">
                          {app.application_type === "individual"
                            ? `${app.first_name} ${app.last_name}`
                            : app.company_name}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {app.email}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <FileCheck className="h-4 w-4 text-muted-foreground" />
                      <Badge
                        variant="secondary"
                        className={`${statusColors[app.status as keyof typeof statusColors]} text-white`}
                      >
                        {app.status.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      <Badge
                        variant="secondary"
                        className={`${amlColors[app.aml_status as keyof typeof amlColors]} text-white`}
                      >
                        AML: {app.aml_status.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(app.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {applications.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileCheck className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">No applications yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Start onboarding a lead to create your first application
                </p>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Start Onboarding
                </Button>
              </CardContent>
            </Card>
          )}
      </div>
    </DashboardLayout>
  );
};

export default Onboarding;
