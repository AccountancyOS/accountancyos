import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GripVertical, FileText, Send, Settings } from "lucide-react";

interface JobTask {
  id: string;
  name: string;
  description?: string;
  role?: string;
  relativeDueDays?: number;
  dependencies?: string[];
  isClientFacing: boolean;
  order?: number;
}

interface QuestionnaireConfig {
  templateId?: string;
  triggerStatus: string;
  feedsWorkpaper: boolean;
  autoSend: boolean;
}

interface WorkpaperConfig {
  templateId?: string;
  autoCreate: boolean;
}

interface JobTemplateContent {
  tasks: JobTask[];
  questionnaires: QuestionnaireConfig[];
  workpaper: WorkpaperConfig;
  statusFlow: string[];
}

interface JobTemplateEditorProps {
  content: any;
  onChange: (content: any) => void;
}

const JOB_STATUSES = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'awaiting_info', label: 'Awaiting Info' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
  { value: 'ready_to_file', label: 'Ready to File' },
  { value: 'filed', label: 'Filed' },
  { value: 'completed', label: 'Completed' },
];

const ROLES = [
  { value: 'Junior', label: 'Junior' },
  { value: 'Senior', label: 'Senior' },
  { value: 'Manager', label: 'Manager' },
  { value: 'Partner', label: 'Partner' },
];

export default function JobTemplateEditor({ content, onChange }: JobTemplateEditorProps) {
  const [activeTab, setActiveTab] = useState("tasks");

  const templateContent: JobTemplateContent = {
    tasks: content?.tasks || [],
    questionnaires: content?.questionnaires || [],
    workpaper: content?.workpaper || { autoCreate: false },
    statusFlow: content?.statusFlow || JOB_STATUSES.map(s => s.value),
  };

  const updateContent = (updates: Partial<JobTemplateContent>) => {
    onChange({ ...content, ...updates });
  };

  // Task management
  const addTask = () => {
    const newTask: JobTask = {
      id: crypto.randomUUID(),
      name: "New Task",
      isClientFacing: false,
      order: templateContent.tasks.length,
    };
    updateContent({ tasks: [...templateContent.tasks, newTask] });
  };

  const updateTask = (taskId: string, updates: Partial<JobTask>) => {
    const updatedTasks = templateContent.tasks.map((t) =>
      t.id === taskId ? { ...t, ...updates } : t
    );
    updateContent({ tasks: updatedTasks });
  };

  const deleteTask = (taskId: string) => {
    updateContent({ tasks: templateContent.tasks.filter((t) => t.id !== taskId) });
  };

  // Questionnaire configuration
  const addQuestionnaire = () => {
    const newConfig: QuestionnaireConfig = {
      triggerStatus: 'awaiting_info',
      feedsWorkpaper: true,
      autoSend: true,
    };
    updateContent({ questionnaires: [...templateContent.questionnaires, newConfig] });
  };

  const updateQuestionnaire = (index: number, updates: Partial<QuestionnaireConfig>) => {
    const updated = [...templateContent.questionnaires];
    updated[index] = { ...updated[index], ...updates };
    updateContent({ questionnaires: updated });
  };

  const deleteQuestionnaire = (index: number) => {
    updateContent({ 
      questionnaires: templateContent.questionnaires.filter((_, i) => i !== index) 
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job Template Builder</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Tasks ({templateContent.tasks.length})
            </TabsTrigger>
            <TabsTrigger value="questionnaires" className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Questionnaires ({templateContent.questionnaires.length})
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button onClick={addTask}>
                <Plus className="mr-2 h-4 w-4" />
                Add Task
              </Button>
            </div>

            {templateContent.tasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No tasks yet. Click "Add Task" to get started.
              </div>
            ) : (
              <div className="space-y-4">
                {templateContent.tasks.map((task, index) => (
                  <Card key={task.id} className="border-2">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <GripVertical className="h-5 w-5 text-muted-foreground mt-2 cursor-grab" />
                        <div className="flex-1 space-y-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Task Name *</Label>
                              <Input
                                value={task.name}
                                onChange={(e) =>
                                  updateTask(task.id, { name: e.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Default Assignee Role</Label>
                              <Select
                                value={task.role || ""}
                                onValueChange={(value) =>
                                  updateTask(task.id, { role: value })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                  {ROLES.map((role) => (
                                    <SelectItem key={role.value} value={role.value}>
                                      {role.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                              value={task.description || ""}
                              onChange={(e) =>
                                updateTask(task.id, { description: e.target.value })
                              }
                              placeholder="Task instructions..."
                              rows={3}
                            />
                          </div>
                          
                          <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                              <Label>Days Before Deadline</Label>
                              <Input
                                type="number"
                                value={task.relativeDueDays || ""}
                                onChange={(e) =>
                                  updateTask(task.id, { 
                                    relativeDueDays: e.target.value ? parseInt(e.target.value) : undefined 
                                  })
                                }
                                placeholder="e.g. 10"
                              />
                              <p className="text-xs text-muted-foreground">
                                Task due date = Filing deadline - this many days
                              </p>
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Dependencies</Label>
                              <Select
                                value=""
                                onValueChange={(value) => {
                                  const deps = task.dependencies || [];
                                  if (!deps.includes(value)) {
                                    updateTask(task.id, { dependencies: [...deps, value] });
                                  }
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Add dependency" />
                                </SelectTrigger>
                                <SelectContent>
                                  {templateContent.tasks
                                    .filter((t) => t.id !== task.id)
                                    .map((t) => (
                                      <SelectItem key={t.id} value={t.id}>
                                        {t.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              {task.dependencies && task.dependencies.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {task.dependencies.map((depId) => {
                                    const depTask = templateContent.tasks.find(t => t.id === depId);
                                    return (
                                      <Badge 
                                        key={depId} 
                                        variant="secondary"
                                        className="cursor-pointer"
                                        onClick={() => {
                                          updateTask(task.id, {
                                            dependencies: task.dependencies?.filter(d => d !== depId)
                                          });
                                        }}
                                      >
                                        {depTask?.name || 'Unknown'} ×
                                      </Badge>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 pt-8">
                              <Switch
                                checked={task.isClientFacing}
                                onCheckedChange={(checked) =>
                                  updateTask(task.id, { isClientFacing: checked })
                                }
                              />
                              <Label>Client-Facing Task</Label>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteTask(task.id)}
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

          <TabsContent value="questionnaires" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button onClick={addQuestionnaire}>
                <Plus className="mr-2 h-4 w-4" />
                Add Questionnaire Trigger
              </Button>
            </div>

            {templateContent.questionnaires.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No questionnaire triggers configured. Add one to automatically send records requests.
              </div>
            ) : (
              <div className="space-y-4">
                {templateContent.questionnaires.map((config, index) => (
                  <Card key={index} className="border-2">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <div className="flex-1 space-y-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Questionnaire Template</Label>
                              <Input
                                value={config.templateId || ""}
                                onChange={(e) =>
                                  updateQuestionnaire(index, { templateId: e.target.value })
                                }
                                placeholder="Select or enter template ID"
                              />
                              <p className="text-xs text-muted-foreground">
                                Link to a Records Request questionnaire template
                              </p>
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Trigger When Status Changes To</Label>
                              <Select
                                value={config.triggerStatus}
                                onValueChange={(value) =>
                                  updateQuestionnaire(index, { triggerStatus: value })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                  {JOB_STATUSES.map((status) => (
                                    <SelectItem key={status.value} value={status.value}>
                                      {status.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          
                          <div className="flex gap-6">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={config.feedsWorkpaper}
                                onCheckedChange={(checked) =>
                                  updateQuestionnaire(index, { feedsWorkpaper: checked })
                                }
                              />
                              <Label>Responses Feed Workpaper</Label>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={config.autoSend}
                                onCheckedChange={(checked) =>
                                  updateQuestionnaire(index, { autoSend: checked })
                                }
                              />
                              <Label>Auto-Send Email</Label>
                            </div>
                          </div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteQuestionnaire(index)}
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

          <TabsContent value="settings" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Workpaper Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={templateContent.workpaper.autoCreate}
                    onCheckedChange={(checked) =>
                      updateContent({ 
                        workpaper: { ...templateContent.workpaper, autoCreate: checked } 
                      })
                    }
                  />
                  <Label>Auto-create workpaper when job is created</Label>
                </div>
                
                {templateContent.workpaper.autoCreate && (
                  <div className="space-y-2">
                    <Label>Workpaper Template</Label>
                    <Input
                      value={templateContent.workpaper.templateId || ""}
                      onChange={(e) =>
                        updateContent({ 
                          workpaper: { ...templateContent.workpaper, templateId: e.target.value } 
                        })
                      }
                      placeholder="Select or enter workpaper template ID"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Status Flow</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Define the status progression for jobs created from this template.
                </p>
                <div className="flex flex-wrap gap-2">
                  {JOB_STATUSES.map((status) => {
                    const isActive = templateContent.statusFlow.includes(status.value);
                    return (
                      <Badge
                        key={status.value}
                        variant={isActive ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => {
                          if (isActive) {
                            updateContent({
                              statusFlow: templateContent.statusFlow.filter(s => s !== status.value)
                            });
                          } else {
                            updateContent({
                              statusFlow: [...templateContent.statusFlow, status.value]
                            });
                          }
                        }}
                      >
                        {status.label}
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
