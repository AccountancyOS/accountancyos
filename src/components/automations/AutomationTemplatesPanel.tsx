import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { BookTemplate, Copy, Zap, Calendar, Briefcase, FileText, Users } from "lucide-react";

interface AutomationTemplate {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  category: string;
  is_system: boolean;
}

interface AutomationTemplatesPanelProps {
  onUseTemplate: (template: AutomationTemplate) => void;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Zap; color: string }> = {
  deadlines: { label: "Deadlines", icon: Calendar, color: "bg-orange-500/10 text-orange-600" },
  jobs: { label: "Jobs", icon: Briefcase, color: "bg-blue-500/10 text-blue-600" },
  filings: { label: "Filings", icon: FileText, color: "bg-green-500/10 text-green-600" },
  onboarding: { label: "Onboarding", icon: Users, color: "bg-purple-500/10 text-purple-600" },
  payroll: { label: "Payroll", icon: Briefcase, color: "bg-pink-500/10 text-pink-600" },
  general: { label: "General", icon: Zap, color: "bg-gray-500/10 text-gray-600" },
};

const TRIGGER_LABELS: Record<string, string> = {
  job_status_change: "Job Status Change",
  deadline_approaching: "Deadline Approaching",
  filing_status_change: "Filing Status Change",
  client_onboarded: "Client Onboarded",
  onboarding_approved: "Onboarding Approved",
};

const ACTION_LABELS: Record<string, string> = {
  create_job: "Create Job",
  create_task: "Create Task",
  send_email: "Send Email",
  send_notification: "Send Notification",
};

export function AutomationTemplatesPanel({ onUseTemplate }: AutomationTemplatesPanelProps) {
  const { data: templates, isLoading } = useQuery({
    queryKey: ["automation-rule-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_rule_templates")
        .select("*")
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return data as AutomationTemplate[];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookTemplate className="h-5 w-5" />
            Automation Templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group templates by category
  const grouped = (templates || []).reduce((acc, template) => {
    const cat = template.category || "general";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(template);
    return acc;
  }, {} as Record<string, AutomationTemplate[]>);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookTemplate className="h-5 w-5" />
          Automation Templates
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[500px]">
          <div className="p-4 space-y-6">
            {Object.entries(grouped).map(([category, categoryTemplates]) => {
              const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.general;
              const Icon = config.icon;

              return (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {config.label}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {categoryTemplates.map((template) => (
                      <div
                        key={template.id}
                        className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{template.name}</span>
                            {template.is_system && (
                              <Badge variant="secondary" className="text-xs">System</Badge>
                            )}
                          </div>
                          {template.description && (
                            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                              {template.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {TRIGGER_LABELS[template.trigger_type] || template.trigger_type}
                            </Badge>
                            <span>→</span>
                            <Badge variant="outline" className="text-xs">
                              {ACTION_LABELS[template.action_type] || template.action_type}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onUseTemplate(template)}
                          className="shrink-0"
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Use
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {Object.keys(grouped).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <BookTemplate className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No templates available</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
