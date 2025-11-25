import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { 
  CheckCircle2, 
  Circle, 
  ArrowRight,
  UserPlus,
  FileText,
  Building2,
  Upload,
  Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  action: string;
  icon: typeof CheckCircle2;
}

export default function WelcomeDashboard() {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const { toast } = useToast();
  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    { id: "branding", label: "Confirm branding", completed: false, action: "/settings", icon: Sparkles },
    { id: "clients", label: "Import clients", completed: false, action: "/clients", icon: Upload },
    { id: "lead", label: "Add first lead", completed: false, action: "/crm", icon: UserPlus },
    { id: "compliance", label: "Connect Companies House & HMRC", completed: false, action: "/settings", icon: Building2 },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkCompletionStatus();
  }, [organization]);

  const checkCompletionStatus = async () => {
    if (!organization) return;

    try {
      // Check if branding is set
      const hasBranding = !!organization.logo_url;

      // Check if clients exist
      const { count: clientsCount } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organization.id);

      // Check if leads exist
      const { count: leadsCount } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organization.id);

      // Check if compliance credentials exist
      const { count: credentialsCount } = await supabase
        .from("external_credentials")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organization.id);

      setChecklist(prev => prev.map(item => {
        if (item.id === "branding") return { ...item, completed: hasBranding };
        if (item.id === "clients") return { ...item, completed: (clientsCount || 0) > 0 };
        if (item.id === "lead") return { ...item, completed: (leadsCount || 0) > 0 };
        if (item.id === "compliance") return { ...item, completed: (credentialsCount || 0) > 0 };
        return item;
      }));
    } catch (error) {
      console.error("Error checking completion status:", error);
    } finally {
      setLoading(false);
    }
  };

  const completedCount = checklist.filter(item => item.completed).length;
  const progress = (completedCount / checklist.length) * 100;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold">Welcome to AccountancyOS! 🎉</h1>
          <p className="text-xl text-muted-foreground">
            Let's finish setting up your practice
          </p>
        </div>

        {/* Setup Progress */}
        <Card>
          <CardHeader>
            <CardTitle>Setup Progress</CardTitle>
            <CardDescription>
              {completedCount} of {checklist.length} tasks completed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} className="h-2" />
            <div className="space-y-3">
              {checklist.map((item) => {
                const Icon = item.completed ? CheckCircle2 : Circle;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`h-5 w-5 ${
                          item.completed ? "text-primary" : "text-muted-foreground"
                        }`}
                      />
                      <div className="flex items-center gap-2">
                        <item.icon className="h-4 w-4 text-muted-foreground" />
                        <span className={item.completed ? "line-through text-muted-foreground" : ""}>
                          {item.label}
                        </span>
                      </div>
                    </div>
                    {!item.completed && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(item.action)}
                      >
                        Go
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Quick Actions</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate("/crm")}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Create New Lead</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Add a prospect to your CRM pipeline
                </p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate("/quotes")}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Create Quote</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Generate a proposal for a prospect
                </p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate("/clients")}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Add Client</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Manually add a new client record
                </p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate("/clients")}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Import Data</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Bulk import clients and companies
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Getting Started Tips */}
        <Card>
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
            <CardDescription>Recommended actions to get the most out of AccountancyOS</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex-1">
                <p className="font-medium">Set up your CRM funnels</p>
                <p className="text-sm text-muted-foreground">
                  Configure automated follow-up sequences for your leads
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate("/crm")}>
                Setup
              </Button>
            </div>
            <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex-1">
                <p className="font-medium">Import your existing clients</p>
                <p className="text-sm text-muted-foreground">
                  Upload CSV files to quickly migrate your data
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate("/clients")}>
                Import
              </Button>
            </div>
            <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex-1">
                <p className="font-medium">Customize your service catalogue</p>
                <p className="text-sm text-muted-foreground">
                  Review and adjust the standard UK accounting services
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate("/services")}>
                Customize
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}