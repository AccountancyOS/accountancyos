/**
 * Workflow Library Tab
 * 
 * Shows all available workflow templates from the automation library.
 * Allows practices to enable/disable workflows and configure overrides.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Library,
  Workflow,
  Clock,
  Mail,
  Briefcase,
  ListChecks,
  Bell,
  Timer,
  Pause,
  ChevronRight,
} from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

interface WorkflowTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
  service_type: string | null;
  default_enabled: boolean;
  applies_to_client_types: string[] | null;
}

interface WorkflowStep {
  id: string;
  template_id: string;
  step_type: string;
  step_order: number;
  config: Record<string, unknown>;
  is_optional: boolean;
  is_blocking: boolean;
}

interface OrgOverride {
  id: string;
  template_id: string;
  enabled: boolean;
  timing_overrides: Record<string, unknown>;
  message_template_overrides: Record<string, unknown>;
  channel_overrides: Record<string, unknown>;
  assignment_overrides: Record<string, unknown>;
  optional_step_toggles: Record<string, boolean>;
}

const STEP_TYPE_ICONS: Record<string, typeof Clock> = {
  WAIT_UNTIL: Clock,
  WAIT_FOR_EVENT: Pause,
  SEND_EMAIL: Mail,
  CREATE_JOB: Briefcase,
  CREATE_TASK: ListChecks,
  SEND_NOTIFICATION: Bell,
  SET_SLA_TIMER: Timer,
  UPDATE_STATUS: ChevronRight,
};

const STEP_TYPE_LABELS: Record<string, string> = {
  WAIT_UNTIL: "Wait Until",
  WAIT_FOR_EVENT: "Wait for Event",
  SEND_EMAIL: "Send Email",
  CREATE_JOB: "Create Job",
  CREATE_TASK: "Create Task",
  SEND_NOTIFICATION: "Notify",
  SET_SLA_TIMER: "Set SLA Timer",
  UPDATE_STATUS: "Update Status",
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  corporation_tax: "Corporation Tax",
  self_assessment: "Self Assessment",
  vat: "VAT",
  payroll: "Payroll",
  cis: "CIS",
  accounts: "Accounts",
  confirmation_statement: "Confirmation Statement",
  bookkeeping: "Bookkeeping",
};

export function WorkflowLibraryTab() {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  // Fetch all global workflow templates
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ["workflow-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_workflow_templates")
        .select("*")
        .is("org_id", null)
        .order("service_type", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data as WorkflowTemplate[];
    },
  });

  // Fetch org overrides
  const { data: overrides, isLoading: overridesLoading } = useQuery({
    queryKey: ["workflow-org-overrides", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("automation_org_overrides")
        .select("*")
        .eq("org_id", organization.id);
      if (error) throw error;
      return data as OrgOverride[];
    },
    enabled: !!organization?.id,
  });

  // Fetch steps for expanded template
  const { data: steps } = useQuery({
    queryKey: ["workflow-steps", expandedTemplate],
    queryFn: async () => {
      if (!expandedTemplate) return [];
      const { data, error } = await supabase
        .from("automation_workflow_steps")
        .select("*")
        .eq("template_id", expandedTemplate)
        .order("step_order", { ascending: true });
      if (error) throw error;
      return data as WorkflowStep[];
    },
    enabled: !!expandedTemplate,
  });

  // Toggle workflow enabled/disabled
  const toggleMutation = useMutation({
    mutationFn: async ({ templateId, enabled }: { templateId: string; enabled: boolean }) => {
      if (!organization?.id) throw new Error("No organization");

      const existing = overrides?.find((o) => o.template_id === templateId);

      if (existing) {
        const { error } = await supabase
          .from("automation_org_overrides")
          .update({ enabled })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("automation_org_overrides")
          .insert({
            org_id: organization.id,
            template_id: templateId,
            enabled,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow-org-overrides"] });
      toast({ title: "Workflow updated" });
    },
    onError: (err) => {
      toast({ title: "Error updating workflow", description: err.message, variant: "destructive" });
    },
  });

  // Toggle optional step
  const toggleStepMutation = useMutation({
    mutationFn: async ({
      templateId,
      stepId,
      enabled,
    }: {
      templateId: string;
      stepId: string;
      enabled: boolean;
    }) => {
      if (!organization?.id) throw new Error("No organization");

      const existing = overrides?.find((o) => o.template_id === templateId);
      const currentToggles = (existing?.optional_step_toggles || {}) as Record<string, boolean>;
      const newToggles = { ...currentToggles, [stepId]: enabled };

      if (existing) {
        const { error } = await supabase
          .from("automation_org_overrides")
          .update({ optional_step_toggles: newToggles as Json })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("automation_org_overrides")
          .insert({
            org_id: organization.id,
            template_id: templateId,
            enabled: true,
            optional_step_toggles: newToggles as Json,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow-org-overrides"] });
    },
  });

  const isEnabled = (templateId: string, defaultEnabled: boolean): boolean => {
    const override = overrides?.find((o) => o.template_id === templateId);
    return override ? override.enabled : defaultEnabled;
  };

  const isStepEnabled = (templateId: string, stepId: string): boolean => {
    const override = overrides?.find((o) => o.template_id === templateId);
    if (!override?.optional_step_toggles) return true;
    const toggles = override.optional_step_toggles as Record<string, boolean>;
    return toggles[stepId] !== false;
  };

  // Group templates by service type
  const grouped = (templates || []).reduce(
    (acc, tpl) => {
      const key = tpl.service_type || "general";
      if (!acc[key]) acc[key] = [];
      acc[key].push(tpl);
      return acc;
    },
    {} as Record<string, WorkflowTemplate[]>
  );

  const isLoading = templatesLoading || overridesLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Library className="h-5 w-5" />
            Standard Automation Library
          </h2>
          <p className="text-sm text-muted-foreground">
            Pre-built workflows for UK accounting practice. Enable or customise per your needs.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {templates?.length || 0} workflows
        </Badge>
      </div>

      <ScrollArea className="h-[calc(100vh-320px)]">
        <div className="space-y-8 pr-4">
          {Object.entries(grouped).map(([serviceType, groupTemplates]) => (
            <div key={serviceType}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {SERVICE_TYPE_LABELS[serviceType] || serviceType}
              </h3>
              <div className="space-y-3">
                {groupTemplates.map((tpl) => {
                  const enabled = isEnabled(tpl.id, tpl.default_enabled);
                  return (
                    <Card
                      key={tpl.id}
                      className={`transition-colors ${!enabled ? "opacity-60" : ""}`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Workflow className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <CardTitle className="text-sm font-medium truncate">
                                {tpl.name}
                              </CardTitle>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {tpl.description}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {tpl.applies_to_client_types && (
                              <div className="hidden md:flex gap-1">
                                {tpl.applies_to_client_types.map((ct) => (
                                  <Badge key={ct} variant="secondary" className="text-xs">
                                    {ct}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <Switch
                              checked={enabled}
                              onCheckedChange={(checked) =>
                                toggleMutation.mutate({ templateId: tpl.id, enabled: checked })
                              }
                            />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <Accordion
                          type="single"
                          collapsible
                          value={expandedTemplate === tpl.id ? tpl.id : undefined}
                          onValueChange={(val) =>
                            setExpandedTemplate(val || null)
                          }
                        >
                          <AccordionItem value={tpl.id} className="border-0">
                            <AccordionTrigger className="py-1 text-xs text-muted-foreground hover:no-underline">
                              View steps
                            </AccordionTrigger>
                            <AccordionContent>
                              {expandedTemplate === tpl.id && steps && (
                                <div className="space-y-2 mt-2">
                                  {steps.map((step, idx) => {
                                    const Icon =
                                      STEP_TYPE_ICONS[step.step_type] || ChevronRight;
                                    const stepEnabled = step.is_optional
                                      ? isStepEnabled(tpl.id, step.id)
                                      : true;

                                    return (
                                      <div
                                        key={step.id}
                                        className={`flex items-center gap-3 py-1.5 px-2 rounded text-sm ${
                                          !stepEnabled ? "opacity-40" : ""
                                        }`}
                                      >
                                        <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                                          {idx + 1}
                                        </span>
                                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <span className="flex-1 min-w-0 truncate">
                                          {STEP_TYPE_LABELS[step.step_type] || step.step_type}
                                          {step.config && (step.config as Record<string, unknown>).message_template_key && (
                                            <span className="text-muted-foreground ml-1">
                                              — {String((step.config as Record<string, unknown>).message_template_key)}
                                            </span>
                                          )}
                                          {step.config && (step.config as Record<string, unknown>).service_type && (
                                            <span className="text-muted-foreground ml-1">
                                              — {SERVICE_TYPE_LABELS[String((step.config as Record<string, unknown>).service_type)] || String((step.config as Record<string, unknown>).service_type)}
                                            </span>
                                          )}
                                        </span>
                                        {step.is_optional && (
                                          <div className="flex items-center gap-2 shrink-0">
                                            <Badge variant="outline" className="text-xs">
                                              Optional
                                            </Badge>
                                            <Switch
                                              className="scale-75"
                                              checked={stepEnabled}
                                              onCheckedChange={(checked) =>
                                                toggleStepMutation.mutate({
                                                  templateId: tpl.id,
                                                  stepId: step.id,
                                                  enabled: checked,
                                                })
                                              }
                                            />
                                          </div>
                                        )}
                                        {step.is_blocking && (
                                          <Badge variant="destructive" className="text-xs shrink-0">
                                            Blocking
                                          </Badge>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}

          {Object.keys(grouped).length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Library className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No workflow templates available</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
