import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  Blocks,
  Code2,
  PanelRightOpen,
  PanelRightClose,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { format, addDays, addMonths } from "date-fns";
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
import { ReusableBlocksPanel } from "./ReusableBlocksPanel";
import { DynamicPlaceholdersPreview } from "./DynamicPlaceholdersPreview";

interface JobTemplateEditorFullscreenProps {
  templateId: string;
  onClose: () => void;
}

export function JobTemplateEditorFullscreen({
  templateId,
  onClose,
}: JobTemplateEditorFullscreenProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("tasks");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"blocks" | "placeholders">("blocks");
  const [showSidebar, setShowSidebar] = useState(true);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

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

  // Sample dates for due-date preview
  const sampleDates = useMemo(() => {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const filingDeadline = addDays(periodEnd, relativeDueOffset);
    const jobStart = periodStart;
    const jobEnd = filingDeadline;
    return { periodStart, periodEnd, filingDeadline, jobStart, jobEnd };
  }, [relativeDueOffset]);

  // Calculate sample due date for a task
  const calculateSampleDueDate = (task: TaskTemplate): Date | null => {
    const days = task.relativeDueDays || 0;
    const ref = task.relativeDueReference || "job_end";
    
    let baseDate: Date;
    switch (ref) {
      case "job_start":
        baseDate = sampleDates.jobStart;
        break;
      case "job_end":
        baseDate = sampleDates.jobEnd;
        break;
      case "filing_deadline":
        baseDate = sampleDates.filingDeadline;
        break;
      case "period_start":
        baseDate = sampleDates.periodStart;
        break;
      case "period_end":
        baseDate = sampleDates.periodEnd;
        break;
      default:
        baseDate = sampleDates.jobEnd;
    }
    
    return addDays(baseDate, days);
  };

  // Get due date preview text
  const getDueDatePreview = (task: TaskTemplate): string => {
    const dueDate = calculateSampleDueDate(task);
    if (!dueDate) return "";
    
    const days = task.relativeDueDays || 0;
    const ref = task.relativeDueReference || "job_end";
    const refLabel = ref.replace(/_/g, " ");
    
    const dayText = days === 0 ? "on" : days > 0 ? `${days}d after` : `${Math.abs(days)}d before`;
    
    return `Due ${dayText} ${refLabel} → e.g. ${format(dueDate, "dd MMM yyyy")}`;
  };

  // Handle block insertion
  const handleInsertBlock = (blockTasks: TaskTemplate[]) => {
    const startOrder = tasks.length;
    const tasksWithOrder = blockTasks.map((t, i) => ({
      ...t,
      order: startOrder + i,
    }));
    setTasks([...tasks, ...tasksWithOrder]);
    setHasChanges(true);
  };

  // Toggle task selection
  const toggleTaskSelection = (taskId: string) => {
    const newSet = new Set(selectedTaskIds);
    if (newSet.has(taskId)) {
      newSet.delete(taskId);
    } else {
      newSet.add(taskId);
    }
    setSelectedTaskIds(newSet);
  };

  // Get selected tasks for block creation
  const selectedTasks = tasks.filter((t) => selectedTaskIds.has(t.id));

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
        .order("version_number", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Initialize form from template
  useEffect(() => {
    if (template) {
      const t = template as Record<string, unknown>;
      setName((t.template_name as string) || "");
      setDescription((t.description as string) || "");
      setServiceType(template.service_type || "");
      setFrequency((t.frequency as string) || "one_off");
      setTriggerType((t.trigger_type as string) || "manual");
      setRelativeDueOffset((t.relative_due_offset as number) || 30);
      setUiCategory((t.ui_category as string) || "General");
      setIsActive(template.is_active ?? true);
      setSkipIfNoActivity((t.skip_if_no_activity as boolean) ?? false);
      setAutoCloseIfNoWork((t.auto_close_if_no_work as boolean) ?? false);
      setTriggerConditions((t.trigger_conditions as TriggerCondition[]) || []);
      setEntityFilters((t.entity_filters as EntityFilter) || {});

      // Parse content
      const content = template.tasks as JobTemplateContent | null;
      setTasks(content?.tasks || []);
      setRecordsRequests((t.records_requests_template as RecordsRequestItem[]) || []);
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
          template_name: name,
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
        } as Record<string, unknown>)
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
      if (!organization?.id) throw new Error("No organization");
      return publishTemplateVersion(templateId, organization.id, "Published new version");
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
      const t = template as Record<string, unknown>;
      const templateName = (t.template_name as string) || "";
      const hasModifications =
        name !== templateName ||
        description !== ((t.description as string) || "") ||
        frequency !== ((t.frequency as string) || "one_off");
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
              <Badge variant="outline">v{template?.version ?? 1}</Badge>
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
            title={hasChanges ? "Save changes before publishing" : undefined}
          >
            <History className="h-4 w-4 mr-2" />
            Publish v{(template?.version ?? 1) + 1}
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSidebar(!showSidebar)}
            title={showSidebar ? "Hide sidebar" : "Show sidebar"}
          >
            {showSidebar ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
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
                <div className="flex items-center gap-2">
                  {selectedTaskIds.size > 0 && (
                    <Badge variant="secondary">
                      {selectedTaskIds.size} selected
                    </Badge>
                  )}
                  <Button onClick={addTask}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Task
                  </Button>
                </div>
              </div>

              {tasks.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No tasks defined. Add your first task to get started, or drag a block from the sidebar.
                  </CardContent>
                </Card>
              ) : (
                <div 
                  className="space-y-2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const blockTasks = e.dataTransfer.getData("block-tasks");
                    if (blockTasks) {
                      try {
                        const parsedTasks = JSON.parse(blockTasks) as TaskTemplate[];
                        handleInsertBlock(parsedTasks.map(t => ({
                          ...t,
                          id: crypto.randomUUID(),
                          isFromBlock: true,
                        })));
                      } catch (err) {
                        console.error("Failed to parse block tasks:", err);
                      }
                    }
                  }}
                >
                  {tasks.map((task, index) => (
                    <Card 
                      key={task.id} 
                      className={`group transition-colors ${
                        selectedTaskIds.has(task.id) ? "ring-2 ring-primary" : ""
                      } ${task.isFromBlock ? "border-l-4 border-l-primary/50" : ""}`}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start gap-3">
                          <div className="flex items-center gap-2 text-muted-foreground mt-1">
                            <Checkbox
                              checked={selectedTaskIds.has(task.id)}
                              onCheckedChange={() => toggleTaskSelection(task.id)}
                            />
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
                            {/* Due Date Preview */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>{getDueDatePreview(task)}</span>
                              {task.isFromBlock && (
                                <>
                                  <Separator orientation="vertical" className="h-3" />
                                  <Badge variant="outline" className="text-xs h-5">
                                    <Blocks className="h-3 w-3 mr-1" />
                                    From block
                                  </Badge>
                                </>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100"
                            onClick={() => {
                              deleteTask(task.id);
                              selectedTaskIds.delete(task.id);
                              setSelectedTaskIds(new Set(selectedTaskIds));
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
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
                    Define documents and information to request from the client
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
                    No records requests defined. Add items to request from clients.
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
                            <span className="text-sm font-mono w-6">{index + 1}</span>
                          </div>
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-4">
                              <Input
                                value={request.name}
                                onChange={(e) => updateRecordsRequest(request.id, { name: e.target.value })}
                                placeholder="Request name"
                                className="flex-1"
                              />
                              <Select
                                value={request.requestType}
                                onValueChange={(v) =>
                                  updateRecordsRequest(request.id, { requestType: v as RecordsRequestItem["requestType"] })
                                }
                              >
                                <SelectTrigger className="w-[150px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="document">Document</SelectItem>
                                  <SelectItem value="bank_statement">Bank Statement</SelectItem>
                                  <SelectItem value="receipt">Receipt</SelectItem>
                                  <SelectItem value="p60">P60</SelectItem>
                                  <SelectItem value="invoice">Invoice</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={request.isRequired}
                                  onCheckedChange={(v) => updateRecordsRequest(request.id, { isRequired: v })}
                                />
                                <span className="text-sm text-muted-foreground">Required</span>
                              </div>
                            </div>
                            {request.description && (
                              <p className="text-sm text-muted-foreground">{request.description}</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100"
                            onClick={() => deleteRecordsRequest(request.id)}
                          >
                            <Trash2 className="h-4 w-4" />
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
                        placeholder="e.g., VAT Return Q1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Service Type</Label>
                      <Select value={serviceType} onValueChange={(v) => { setServiceType(v); setHasChanges(true); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select service" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VAT">VAT</SelectItem>
                          <SelectItem value="ACCOUNTS">Accounts</SelectItem>
                          <SelectItem value="CT600">Corporation Tax</SelectItem>
                          <SelectItem value="SA">Self Assessment</SelectItem>
                          <SelectItem value="BOOKKEEPING">Bookkeeping</SelectItem>
                          <SelectItem value="PAYROLL">Payroll</SelectItem>
                          <SelectItem value="COSEC">CoSec</SelectItem>
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
                      placeholder="Describe what this template is for..."
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Frequency</Label>
                      <Select value={frequency} onValueChange={(v) => { setFrequency(v); setHasChanges(true); }}>
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
                      <Label>Trigger Type</Label>
                      <Select value={triggerType} onValueChange={(v) => { setTriggerType(v); setHasChanges(true); }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual</SelectItem>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="service_activated">Service Activated</SelectItem>
                          <SelectItem value="deadline_approaching">Deadline Approaching</SelectItem>
                          <SelectItem value="previous_job_completed">Previous Job Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={uiCategory} onValueChange={(v) => { setUiCategory(v); setHasChanges(true); }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="General">General</SelectItem>
                          <SelectItem value="Tax">Tax</SelectItem>
                          <SelectItem value="Compliance">Compliance</SelectItem>
                          <SelectItem value="Bookkeeping">Bookkeeping</SelectItem>
                          <SelectItem value="Payroll">Payroll</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Advanced Settings */}
              <Accordion type="single" collapsible>
                <AccordionItem value="advanced">
                  <AccordionTrigger className="text-sm">
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      Advanced Settings
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <Card>
                      <CardContent className="pt-4 space-y-4">
                        <div className="space-y-2">
                          <Label>Due Date Offset (days from period end)</Label>
                          <Input
                            type="number"
                            value={relativeDueOffset}
                            onChange={(e) => {
                              setRelativeDueOffset(parseInt(e.target.value) || 30);
                              setHasChanges(true);
                            }}
                            className="w-32"
                          />
                        </div>
                        <Separator />
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Skip if no activity</Label>
                              <p className="text-sm text-muted-foreground">
                                Don't generate job if there's no relevant activity
                              </p>
                            </div>
                            <Switch
                              checked={skipIfNoActivity}
                              onCheckedChange={(v) => {
                                setSkipIfNoActivity(v);
                                setHasChanges(true);
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Auto-close if no work</Label>
                              <p className="text-sm text-muted-foreground">
                                Automatically close job if no tasks are completed
                              </p>
                            </div>
                            <Switch
                              checked={autoCloseIfNoWork}
                              onCheckedChange={(v) => {
                                setAutoCloseIfNoWork(v);
                                setHasChanges(true);
                              }}
                            />
                          </div>
                        </div>
                        <Separator />
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Trigger Conditions</Label>
                            <Button variant="outline" size="sm" onClick={addTriggerCondition}>
                              <Plus className="h-3 w-3 mr-1" />
                              Add Condition
                            </Button>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Only generate this job when all conditions are met
                          </p>
                          {triggerConditions.length > 0 && (
                            <div className="space-y-2">
                              {triggerConditions.map((condition, index) => (
                                <div key={index} className="flex items-center gap-2">
                                  <Select
                                    value={condition.field}
                                    onValueChange={(v) => {
                                      const updated = [...triggerConditions];
                                      updated[index] = { ...condition, field: v };
                                      setTriggerConditions(updated);
                                      setHasChanges(true);
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
                                      updated[index] = { ...condition, operator: v as typeof condition.operator };
                                      setTriggerConditions(updated);
                                      setHasChanges(true);
                                    }}
                                  >
                                    <SelectTrigger className="w-[120px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {TRIGGER_OPERATORS.map((op) => (
                                        <SelectItem key={op} value={op}>
                                          {op}
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
                                      setHasChanges(true);
                                    }}
                                    placeholder="Value"
                                    className="flex-1"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setTriggerConditions(triggerConditions.filter((_, i) => i !== index));
                                      setHasChanges(true);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
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
                  View and compare previous versions of this template
                </p>
              </div>

              {/* Current Version Info */}
              <Card className="border-primary/50">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Badge>v{template?.version ?? 1} (current)</Badge>
                      <div>
                        <p className="font-medium">Current working version</p>
                        <p className="text-sm text-muted-foreground">
                          {hasChanges ? (
                            <span className="text-amber-600 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Unsaved changes
                            </span>
                          ) : (
                            "All changes saved"
                          )}
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => publishMutation.mutate()}
                      disabled={publishMutation.isPending || hasChanges}
                    >
                      <History className="h-4 w-4 mr-2" />
                      Publish as v{(template?.version ?? 1) + 1}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {versions && versions.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Published Versions</h3>
                  {versions.map((version) => (
                    <Card key={version.id}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <Badge variant="outline">v{version.version_number}</Badge>
                            <div>
                              <p className="font-medium">{version.change_notes || "No notes"}</p>
                              <p className="text-sm text-muted-foreground">
                                Published {format(new Date(version.created_at), "dd MMM yyyy HH:mm")}
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
              ) : (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No versions published yet. Save and publish to create the first version.
                  </CardContent>
                </Card>
              )}

              {/* Versioning Info */}
              <div className="bg-muted/50 rounded-lg p-4 text-sm">
                <h4 className="font-medium mb-2">How versioning works</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Jobs created from this template are locked to the version used at creation</li>
                  <li>• Publishing creates a snapshot that can be referenced later</li>
                  <li>• Existing jobs are not affected when you publish a new version</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Sidebar - Blocks & Placeholders */}
        {showSidebar && (
          <aside className="w-80 border-l flex flex-col bg-muted/30">
            <div className="border-b p-2">
              <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as "blocks" | "placeholders")}>
                <TabsList className="w-full">
                  <TabsTrigger value="blocks" className="flex-1">
                    <Blocks className="h-4 w-4 mr-2" />
                    Blocks
                  </TabsTrigger>
                  <TabsTrigger value="placeholders" className="flex-1">
                    <Code2 className="h-4 w-4 mr-2" />
                    Placeholders
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {sidebarTab === "blocks" ? (
              <ReusableBlocksPanel
                onInsertBlock={handleInsertBlock}
                selectedTasks={selectedTasks}
              />
            ) : (
              <DynamicPlaceholdersPreview
                metadata={{
                  relativeDueOffset,
                  frequency: frequency as "one_off" | "monthly" | "quarterly" | "annual",
                }}
                periodStart={sampleDates.periodStart}
                periodEnd={sampleDates.periodEnd}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}