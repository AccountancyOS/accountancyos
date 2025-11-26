import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  MessageSquare,
  Paperclip,
  MoreVertical,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { toast } from "sonner";
import TaskConversation from "./TaskConversation";

interface JobTasksTabProps {
  jobId: string;
}

export default function JobTasksTab({ jobId }: JobTasksTabProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["job-tasks", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_tasks")
        .select("*")
        .eq("job_id", jobId)
        .order("task_order");

      if (error) throw error;
      return data;
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !newTaskTitle.trim()) return;

      const { error } = await supabase.from("job_tasks").insert({
        organization_id: organization.id,
        job_id: jobId,
        title: newTaskTitle,
        task_order: (tasks?.length || 0) + 1,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-tasks", jobId] });
      setNewTaskTitle("");
      toast.success("Task added");
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: any }) => {
      const { error } = await supabase
        .from("job_tasks")
        .update(updates)
        .eq("id", taskId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-tasks", jobId] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("job_tasks")
        .delete()
        .eq("id", taskId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-tasks", jobId] });
      toast.success("Task deleted");
    },
  });

  const toggleTaskStatus = (task: any) => {
    const newStatus = task.status === "done" ? "todo" : "done";
    const updates: any = { status: newStatus };
    
    if (newStatus === "done") {
      updates.completed_at = new Date().toISOString();
    } else {
      updates.completed_at = null;
    }

    updateTaskMutation.mutate({ taskId: task.id, updates });
  };

  const groupedTasks = tasks?.reduce((acc, task) => {
    const stage = task.stage || "Uncategorized";
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(task);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-6">
      {/* Add New Task */}
      <Card>
        <CardHeader>
          <CardTitle>Add Task</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Task title..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTaskTitle.trim()) {
                  createTaskMutation.mutate();
                }
              }}
            />
            <Button
              onClick={() => createTaskMutation.mutate()}
              disabled={!newTaskTitle.trim() || createTaskMutation.isPending}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tasks by Stage */}
      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading tasks...
          </CardContent>
        </Card>
      ) : !tasks || tasks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No tasks yet. Add your first task above.
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedTasks || {}).map(([stage, stageTasks]) => (
          <Card key={stage}>
            <CardHeader>
              <CardTitle className="text-lg">{stage}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stageTasks.map((task) => (
                <div key={task.id}>
                  <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                    <Checkbox
                      checked={task.status === "done"}
                      onCheckedChange={() => toggleTaskStatus(task)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className={`font-medium ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {task.description}
                            </p>
                          )}
                          {task.due_date && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Due: {format(new Date(task.due_date), "dd MMM yyyy")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedTask(task.id)}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => deleteTaskMutation.mutate(task.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Task Conversation */}
                  {selectedTask === task.id && (
                    <div className="ml-9 mt-2">
                      <TaskConversation
                        jobId={jobId}
                        taskId={task.id}
                        onClose={() => setSelectedTask(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
