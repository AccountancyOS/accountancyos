import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  GripVertical,
  Clock,
  Users,
  FileUp,
  CheckSquare,
  Eye,
  ChevronDown,
  Settings2,
  History,
} from "lucide-react";
import { format } from "date-fns";
import {
  JobTemplateContent,
  TaskTemplate,
  RecordsRequestItem,
  TriggerCondition,
  EntityFilter,
  TRIGGER_FIELD_WHITELIST,
  TRIGGER_OPERATORS,
} from "@/lib/job-template-types";
import { publishTemplateVersion } from "@/lib/job-template-engine";

interface JobTemplateEditorFullscreenProps {
  templateId: string;
  onClose: () => void;
}

export function JobTemplateEditorFullscreen({
  templateId,
  onClose,
}: JobTemplateEditorFullscreenProps) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("tasks");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [frequency, setFrequency] = useState("one_off");
  const [triggerType, setTriggerType] = useState("manual");
  const [relativeDueOffset, setRelativeDueOffset] = useState(30);
  const [uiCategory, setUiCategory] = useState("General");
  const [isActive, setIsActive] = useState(true);
  const [skipIfNoActivity, setSkipIfNoActivity] = useState(false);
  const [autoCloseIfNoWork, setAutoCloseIfNoWork] = useState(false);
  const [triggerConditions, setTriggerConditions] = useState<TriggerCondition[]>([]);
  const [entityFilters, setEntityFilters] = useState<EntityFilter>({});
  const [tasks, setTasks] = useState<TaskTemplate[]>([]);
  const [recordsRequests, setRecordsRequests] = useState<RecordsRequestItem[]>([]);

  // Fetch template
  const { data: template, isLoading } = useQuery({
    queryKey: ["job-template", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Fetch version history
  const { data: versions } = useQuery({
    queryKey: ["template-versions", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_versions")
        .select("*")
        .eq("template_id", templateId)
        .order("version", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Initialize form from template
  useEffect(() => {
    if (template) {
      setName(template.name || "");
      setDescription(template.description || "");
      setServiceType(template.service_type || "");
      setFrequency(template.frequency || "one_off");
      setTriggerType(template.trigger_type || "manual");
      setRelativeDueOffset(template.relative_due_offset || 30);
      setUiCategory(template.ui_category || "General");
      setIsActive(template.is_active ?? true);
      setSkipIfNoActivity(template.skip_if_no_activity ?? false);
      setAutoCloseIfNoWork(template.auto_close_if_no_work ?? false);
      setTriggerConditions((template.trigger_conditions as TriggerCondition[]) || []);
      setEntityFilters((template.entity_filters as EntityFilter) || {});

      // Parse content
      const content = template.tasks as JobTemplateContent | null;
      setTasks(content?.tasks || []);
      setRecordsRequests((template.records_requests_template as RecordsRequestItem[]) || []);
    }
  }, [template]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const content: JobTemplateContent = {
        sections: [],
        tasks,
        recordsRequestGroups: [],
        recordsRequests,
        reusableBlockIds: [],
      };

      const { error } = await supabase
        .from("job_templates")
        .update({
          name,
          description,
          service_type: serviceType,
          frequency,
          trigger_type: triggerType,
          relative_due_offset: relativeDueOffset,
          ui_category: uiCategory,
          is_active: isActive,
          skip_if_no_activity: skipIfNoActivity,
          auto_close_if_no_work: autoCloseIfNoWork,
          trigger_conditions: triggerConditions,
          entity_filters: entityFilters,
          tasks: content,
          records_requests_template: recordsRequests,
          updated_at: new Date().toISOString(),
        })
        .eq("id", templateId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-template", templateId] });
      queryClient.invalidateQueries({ queryKey: ["job-templates"] });
      setHasChanges(false);
      toast.success("Template saved");
    },
    onError: (error) => {
      toast.error("Failed to save template");
      console.error(error);
    },
  });

  // Publish version mutation
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("No organization");
      return publishTemplateVersion(templateId, currentOrganization.id, "Published new version");
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["job-template", templateId] });
        queryClient.invalidateQueries({ queryKey: ["template-versions", templateId] });
        toast.success(`Published version ${result.version}`);
      } else {
        toast.error(result.error || "Failed to publish");
      }
    },
  });

  // Track changes
  useEffect(() => {
    if (template) {
      const hasModifications =
        name !== (template.name || "") ||
        description !== (template.description || "") ||
        frequency !== (template.frequency || "one_off");
      setHasChanges(hasModifications);
    }
  }, [name, description, frequency, template]);

  // Task management
  const addTask = () => {
    const newTask: TaskTemplate = {
      id: crypto.randomUUID(),
      name: "New Task",
      taskType: "manual",
      isClientFacing: false,
      order: tasks.length,
      assigneeRole: "unassigned",
      relativeDueReference: "job_end",
      dependencies: [],
      isFromBlock: false,
    };
    setTasks([...tasks, newTask]);
    setHasChanges(true);
  };

  const updateTask = (id: string, updates: Partial<TaskTemplate>) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    setHasChanges(true);
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id));
    setHasChanges(true);
  };

  // Records request management
  const addRecordsRequest = () => {
    const newRequest: RecordsRequestItem = {
      id: crypto.randomUUID(),
      name: "New Document Request",
      requestType: "document",
      isRequired: true,
      order: recordsRequests.length,
      maxFiles: 10,
    };
    setRecordsRequests([...recordsRequests, newRequest]);
    setHasChanges(true);
  };

  const updateRecordsRequest = (id: string, updates: Partial<RecordsRequestItem>) => {
    setRecordsRequests(recordsRequests.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    setHasChanges(true);
  };

  const deleteRecordsRequest = (id: string) => {
    setRecordsRequests(recordsRequests.filter((r) => r.id !== id));
    setHasChanges(true);
  };

  // Trigger condition management
  const addTriggerCondition = () => {
    setTriggerConditions([
      ...triggerConditions,
      { field: "company.vat_frequency", operator: "equals", value: "" },
    ]);
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <div className="text-muted-foreground">Loading template...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between bg-background">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{name || "Untitled Template"}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">v{template?.version || 1}</Badge>
              <span>•</span>
              <span>{frequency?.replace("_", " ")}</span>
              {hasChanges && (
                <>
                  <span>•</span>
                  <Badge variant="secondary">Unsaved changes</Badge>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => publishMutation.mutate()}
            disabled={publishMutation.isPending || hasChanges}
          >
            <History className="h-4 w-4 mr-2" />
            Publish Version
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Main Editor */}
        <div className="flex-1 overflow-y-auto p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="records">Records Requests</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="history">Version History</TabsTrigger>
            </TabsList>

            {/* Tasks Tab */}
            <TabsContent value="tasks" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium">Task List</h2>
                  <p className="text-sm text-muted-foreground">
                    Define the tasks that will be created when this job is generated
                  </p>
                </div>
                <Button onClick={addTask}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
              </div>

              {tasks.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No tasks defined. Add your first task to get started.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task, index) => (
                    <Card key={task.id} className="group">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start gap-4">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <GripVertical className="h-4 w-4 cursor-grab" />
                            <span className="text-sm font-mono w-6">{index + 1}</span>
                          </div>
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-4">
                              <Input
                                value={task.name}
                                onChange={(e) => updateTask(task.id, { name: e.target.value })}
                                placeholder="Task name"
                                className="flex-1"
                              />
                              <Select
                                value={task.taskType}
                                onValueChange={(v) =>
                                  updateTask(task.id, { taskType: v as TaskTemplate["taskType"] })
                                }
                              >
                                <SelectTrigger className="w-[150px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="manual">Manual</SelectItem>
                                  <SelectItem value="document_upload">Document Upload</SelectItem>
                                  <SelectItem value="questionnaire">Questionnaire</SelectItem>
                                  <SelectItem value="review">Review</SelectItem>
                                  <SelectItem value="approval">Approval</SelectItem>
                                  <SelectItem value="filing_draft">Filing</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select
                                value={task.assigneeRole}
                                onValueChange={(v) =>
                                  updateTask(task.id, { assigneeRole: v as TaskTemplate["assigneeRole"] })
                                }
                              >
                                <SelectTrigger className="w-[130px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">Unassigned</SelectItem>
                                  <SelectItem value="junior">Junior</SelectItem>
                                  <SelectItem value="senior">Senior</SelectItem>
                                  <SelectItem value="manager">Manager</SelectItem>
                                  <SelectItem value="partner">Partner</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <Input
                                  type="number"
                                  value={task.relativeDueDays ?? 0}
                                  onChange={(e) =>
                                    updateTask(task.id, { relativeDueDays: parseInt(e.target.value) || 0 })
                                  }
                                  className="w-20 h-8"
                                />
                                <span className="text-muted-foreground">days from</span>
                                <Select
                                  value={task.relativeDueReference}
                                  onValueChange={(v) =>
                                    updateTask(task.id, { relativeDueReference: v as TaskTemplate["relativeDueReference"] })
                                  }
                                >
                                  <SelectTrigger className="w-[140px] h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="job_start">Job Start</SelectItem>
                                    <SelectItem value="job_end">Job End</SelectItem>
                                    <SelectItem value="filing_deadline">Filing Deadline</SelectItem>
                                    <SelectItem value="period_start">Period Start</SelectItem>
                                    <SelectItem value="period_end">Period End</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <Separator orientation="vertical" className="h-6" />
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={task.isClientFacing}
                                  onCheckedChange={(v) => updateTask(task.id, { isClientFacing: v })}
                                />
                                <span className="text-muted-foreground">Client visible</span>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100"
                            onClick={() => deleteTask(task.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Records Requests Tab */}
            <TabsContent value="records" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium">Records Requests</h2>
                  <p className="text-sm text-muted-foreground">
                    Documents and information to request from the client
                  </p>
                </div>
                <Button onClick={addRecordsRequest}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Request
                </Button>
              </div>

              {recordsRequests.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No records requests defined. Add document requests for clients.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {recordsRequests.map((request, index) => (
                    <Card key={request.id} className="group">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start gap-4">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <GripVertical className="h-4 w-4 cursor-grab" />
                            <FileUp className="h-4 w-4" />
                          </div>
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-4">
                              <Input
                                value={request.name}
                                onChange={(e) =>
                                  updateRecordsRequest(request.id, { name: e.target.value })
                                }
                                placeholder="Request name"
                                className="flex-1"
                              />
                              <Select
                                value={request.requestType}
                                onValueChange={(v) =>
                                  updateRecordsRequest(request.id, {
                                    requestType: v as RecordsRequestItem["requestType"],
                                  })
                                }
                              >
                                <SelectTrigger className="w-[150px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="document">Document</SelectItem>
                                  <SelectItem value="questionnaire">Questionnaire</SelectItem>
                                  <SelectItem value="data_field">Data Field</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center gap-4">
                              <Textarea
                                value={request.description || ""}
                                onChange={(e) =>
                                  updateRecordsRequest(request.id, { description: e.target.value })
                                }
                                placeholder="Description for the client"
                                className="flex-1 h-16"
                              />
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={request.isRequired}
                                  onCheckedChange={(v) =>
                                    updateRecordsRequest(request.id, { isRequired: v })
                                  }
                                />
                                <span className="text-muted-foreground">Required</span>
                              </div>
                              {request.requestType === "document" && (
                                <>
                                  <Separator orientation="vertical" className="h-6" />
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">File types:</span>
                                    <Input
                                      value={request.fileTypes?.join(", ") || ""}
                                      onChange={(e) =>
                                        updateRecordsRequest(request.id, {
                                          fileTypes: e.target.value
                                            .split(",")
                                            .map((s) => s.trim())
                                            .filter(Boolean),
                                        })
                                      }
                                      placeholder="pdf, xlsx, jpg"
                                      className="w-40 h-8"
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100"
                            onClick={() => deleteRecordsRequest(request.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-6">
              {/* Basic Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Basic Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Template Name</Label>
                      <Input
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          setHasChanges(true);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Service Type</Label>
                      <Select value={serviceType} onValueChange={setServiceType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select service" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VAT">VAT</SelectItem>
                          <SelectItem value="ACCOUNTS">Accounts</SelectItem>
                          <SelectItem value="CT">Corporation Tax</SelectItem>
                          <SelectItem value="SA">Self Assessment</SelectItem>
                          <SelectItem value="BOOKKEEPING">Bookkeeping</SelectItem>
                          <SelectItem value="PAYROLL">Payroll</SelectItem>
                          <SelectItem value="CIS">CIS</SelectItem>
                          <SelectItem value="CS01">Confirmation Statement</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        setHasChanges(true);
                      }}
                      placeholder="Describe what this template is for"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Frequency</Label>
                      <Select value={frequency} onValueChange={setFrequency}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="one_off">One-off</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                          <SelectItem value="triggered">Triggered</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Trigger</Label>
                      <Select value={triggerType} onValueChange={setTriggerType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual</SelectItem>
                          <SelectItem value="service_activated">Service Activated</SelectItem>
                          <SelectItem value="period_start">Period Start</SelectItem>
                          <SelectItem value="period_end">Period End</SelectItem>
                          <SelectItem value="previous_job_completed">Previous Job Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Due Offset (days)</Label>
                      <Input
                        type="number"
                        value={relativeDueOffset}
                        onChange={(e) => setRelativeDueOffset(parseInt(e.target.value) || 30)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch checked={isActive} onCheckedChange={setIsActive} />
                      <Label>Active</Label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Advanced Settings */}
              <Accordion type="single" collapsible>
                <AccordionItem value="advanced">
                  <AccordionTrigger className="text-base font-medium">
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      Advanced Settings
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-4 space-y-6">
                    {/* Trigger Conditions */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Trigger Conditions</CardTitle>
                        <CardDescription>
                          Only generate job when ALL conditions are met
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {triggerConditions.map((condition, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Select
                              value={condition.field}
                              onValueChange={(v) => {
                                const updated = [...triggerConditions];
                                updated[index] = { ...condition, field: v as any };
                                setTriggerConditions(updated);
                              }}
                            >
                              <SelectTrigger className="w-[200px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TRIGGER_FIELD_WHITELIST.map((field) => (
                                  <SelectItem key={field} value={field}>
                                    {field}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={condition.operator}
                              onValueChange={(v) => {
                                const updated = [...triggerConditions];
                                updated[index] = { ...condition, operator: v as any };
                                setTriggerConditions(updated);
                              }}
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TRIGGER_OPERATORS.map((op) => (
                                  <SelectItem key={op} value={op}>
                                    {op.replace("_", " ")}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              value={String(condition.value || "")}
                              onChange={(e) => {
                                const updated = [...triggerConditions];
                                updated[index] = { ...condition, value: e.target.value };
                                setTriggerConditions(updated);
                              }}
                              placeholder="Value"
                              className="flex-1"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setTriggerConditions(triggerConditions.filter((_, i) => i !== index));
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={addTriggerCondition}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Condition
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Automation Options */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Automation Options</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Skip if no activity</Label>
                            <p className="text-sm text-muted-foreground">
                              Don't generate job if there's no activity to report
                            </p>
                          </div>
                          <Switch checked={skipIfNoActivity} onCheckedChange={setSkipIfNoActivity} />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Auto-close if no work</Label>
                            <p className="text-sm text-muted-foreground">
                              Automatically close job if nil return
                            </p>
                          </div>
                          <Switch
                            checked={autoCloseIfNoWork}
                            onCheckedChange={setAutoCloseIfNoWork}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>

            {/* Version History Tab */}
            <TabsContent value="history" className="space-y-4">
              <div>
                <h2 className="text-lg font-medium">Version History</h2>
                <p className="text-sm text-muted-foreground">
                  Track changes to this template over time
                </p>
              </div>

              {versions?.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No version history yet. Publish a version to start tracking changes.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {versions?.map((version) => (
                    <Card key={version.id}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <Badge variant="outline">v{version.version}</Badge>
                            <div>
                              <p className="font-medium">
                                {version.change_notes || "No change notes"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Published{" "}
                                {format(new Date(version.published_at), "dd MMM yyyy 'at' HH:mm")}
                              </p>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
