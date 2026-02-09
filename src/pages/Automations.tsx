import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { RequirePermission } from "@/components/ui/permission-guard";
import { AutomationRuleEditor } from "@/components/automations/AutomationRuleEditor";
import { AutomationTemplatesPanel } from "@/components/automations/AutomationTemplatesPanel";
import {
  Zap,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  BookTemplate,
  Play,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import type { Json } from "@/integrations/supabase/types";

interface AutomationRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  action_type: string;
  action_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

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

export default function Automations() {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [triggerFilter, setTriggerFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["automation-rules", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("automation_rules")
        .select("*")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as AutomationRule[];
    },
    enabled: !!organization?.id,
  });

  const { data: recentExecutions } = useQuery({
    queryKey: ["automation-executions-recent", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("automation_executions")
        .select("automation_rule_id, status, executed_at")
        .eq("organization_id", organization.id)
        .order("executed_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      // Group by rule to get last execution per rule
      const byRule: Record<string, { status: string; executed_at: string }> = {};
      for (const exec of data || []) {
        if (!byRule[exec.automation_rule_id]) {
          byRule[exec.automation_rule_id] = {
            status: exec.status,
            executed_at: exec.executed_at || "",
          };
        }
      }
      return byRule;
    },
    enabled: !!organization?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async (rule: {
      id?: string;
      name: string;
      trigger_type: string;
      trigger_config: Record<string, unknown>;
      action_type: string;
      action_config: Record<string, unknown>;
      is_active: boolean;
    }) => {
      if (!organization?.id) throw new Error("No organization");

      const payload = {
        organization_id: organization.id,
        name: rule.name,
        trigger_type: rule.trigger_type,
        trigger_config: rule.trigger_config as Json,
        action_type: rule.action_type,
        action_config: rule.action_config as Json,
        is_active: rule.is_active,
      };

      if (rule.id) {
        const { error } = await supabase
          .from("automation_rules")
          .update(payload)
          .eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("automation_rules")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      setEditorOpen(false);
      setEditingRule(null);
      toast({ title: "Rule saved successfully" });
    },
    onError: (error) => {
      toast({ title: "Error saving rule", description: error.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("automation_rules")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
    },
    onError: (error) => {
      toast({ title: "Error updating rule", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("automation_rules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast({ title: "Rule deleted" });
    },
    onError: (error) => {
      toast({ title: "Error deleting rule", description: error.message, variant: "destructive" });
    },
  });

  const handleUseTemplate = (template: {
    name: string;
    trigger_type: string;
    trigger_config: Record<string, unknown>;
    action_type: string;
    action_config: Record<string, unknown>;
  }) => {
    setEditingRule({
      id: "",
      name: template.name,
      trigger_type: template.trigger_type,
      trigger_config: template.trigger_config,
      action_type: template.action_type,
      action_config: template.action_config,
      is_active: true,
      created_at: "",
      updated_at: "",
    });
    setEditorOpen(true);
    setShowTemplates(false);
  };

  // Filter rules
  const filteredRules = (rules || []).filter((rule) => {
    if (search && !rule.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (triggerFilter !== "all" && rule.trigger_type !== triggerFilter) return false;
    if (actionFilter !== "all" && rule.action_type !== actionFilter) return false;
    if (statusFilter === "active" && !rule.is_active) return false;
    if (statusFilter === "inactive" && rule.is_active) return false;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-foreground">Automations</h1>
              <p className="text-muted-foreground mt-1">
                Create rules to automate repetitive tasks
              </p>
            </div>
            <RequirePermission permission="can_manage_automation_rules">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowTemplates(!showTemplates)}
                >
                  <BookTemplate className="mr-2 h-4 w-4" />
                  Templates
                </Button>
                <Button onClick={() => {
                  setEditingRule(null);
                  setEditorOpen(true);
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Rule
                </Button>
              </div>
            </RequirePermission>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Content */}
            <div className={showTemplates ? "lg:col-span-2" : "lg:col-span-3"}>
              {/* Filters */}
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <div className="flex flex-wrap gap-4">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search rules..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select value={triggerFilter} onValueChange={setTriggerFilter}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="All triggers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All triggers</SelectItem>
                        {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={actionFilter} onValueChange={setActionFilter}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="All actions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All actions</SelectItem>
                        {Object.entries(ACTION_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="All status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Rules Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Automation Rules ({filteredRules.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : filteredRules.length === 0 ? (
                    <div className="text-center py-12">
                      <Zap className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                      <h3 className="text-lg font-medium mb-2">No automation rules</h3>
                      <p className="text-muted-foreground mb-4">
                        {search || triggerFilter !== "all" || actionFilter !== "all"
                          ? "No rules match your filters"
                          : "Create your first rule to automate tasks"}
                      </p>
                      <RequirePermission permission="can_manage_automation_rules">
                        <Button onClick={() => setEditorOpen(true)}>
                          <Plus className="mr-2 h-4 w-4" />
                          Create Rule
                        </Button>
                      </RequirePermission>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Trigger</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Last Run</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRules.map((rule) => {
                          const lastExec = recentExecutions?.[rule.id];
                          return (
                            <TableRow key={rule.id}>
                              <TableCell className="font-medium">{rule.name}</TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">
                                  {ACTION_LABELS[rule.action_type] || rule.action_type}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {lastExec ? (
                                  <div className="flex items-center gap-1.5">
                                    {lastExec.status === "success" ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                      <AlertCircle className="h-4 w-4 text-red-500" />
                                    )}
                                    <span className="text-sm text-muted-foreground">
                                      {format(new Date(lastExec.executed_at), "dd MMM HH:mm")}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">Never</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <RequirePermission permission="can_manage_automation_rules">
                                  <Switch
                                    checked={rule.is_active}
                                    onCheckedChange={(checked) =>
                                      toggleMutation.mutate({ id: rule.id, is_active: checked })
                                    }
                                  />
                                </RequirePermission>
                              </TableCell>
                              <TableCell>
                                <RequirePermission permission="can_manage_automation_rules">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setEditingRule(rule);
                                          setEditorOpen(true);
                                        }}
                                      >
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="text-destructive"
                                        onClick={() => deleteMutation.mutate(rule.id)}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </RequirePermission>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Templates Panel */}
            {showTemplates && (
              <div className="lg:col-span-1">
                <AutomationTemplatesPanel onUseTemplate={handleUseTemplate} />
              </div>
            )}
          </div>
      </div>

      <AutomationRuleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        rule={editingRule}
        onSave={(rule) => saveMutation.mutate(rule)}
        isSaving={saveMutation.isPending}
      />
    </DashboardLayout>
  );
}
