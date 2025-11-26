import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface JobTask {
  id: string;
  name: string;
  description?: string;
  role?: string;
  relativeDueDate?: string;
  dependencies?: string[];
  isClientFacing: boolean;
}

interface JobTemplateEditorProps {
  content: any;
  onChange: (content: any) => void;
}

export default function JobTemplateEditor({ content, onChange }: JobTemplateEditorProps) {
  const tasks: JobTask[] = content.tasks || [];

  const addTask = () => {
    const newTask: JobTask = {
      id: crypto.randomUUID(),
      name: "New Task",
      isClientFacing: false,
    };
    onChange({ ...content, tasks: [...tasks, newTask] });
  };

  const updateTask = (taskId: string, updates: Partial<JobTask>) => {
    const updatedTasks = tasks.map((t) =>
      t.id === taskId ? { ...t, ...updates } : t
    );
    onChange({ ...content, tasks: updatedTasks });
  };

  const deleteTask = (taskId: string) => {
    onChange({ ...content, tasks: tasks.filter((t) => t.id !== taskId) });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Job Tasks Builder</CardTitle>
        <Button onClick={addTask}>
          <Plus className="mr-2 h-4 w-4" />
          Add Task
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No tasks yet. Click "Add Task" to get started.
          </div>
        ) : (
          tasks.map((task, index) => (
            <Card key={task.id} className="border-2">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <GripVertical className="h-5 w-5 text-muted-foreground mt-2" />
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
                        <Label>Role/Assignee</Label>
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
                            <SelectItem value="Junior">Junior</SelectItem>
                            <SelectItem value="Senior">Senior</SelectItem>
                            <SelectItem value="Manager">Manager</SelectItem>
                            <SelectItem value="Partner">Partner</SelectItem>
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
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Relative Due Date</Label>
                        <Input
                          value={task.relativeDueDate || ""}
                          onChange={(e) =>
                            updateTask(task.id, { relativeDueDate: e.target.value })
                          }
                          placeholder="e.g. +10 days from job start"
                        />
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
          ))
        )}
      </CardContent>
    </Card>
  );
}
