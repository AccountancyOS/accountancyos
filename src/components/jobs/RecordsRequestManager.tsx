import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FileText,
  Check,
  Clock,
  Upload,
  MoreHorizontal,
  Eye,
  CheckCircle2,
  AlertCircle,
  GripVertical,
  Bell,
  FileUp,
  MessageSquare,
  Info,
} from "lucide-react";
import { format } from "date-fns";

interface ClientTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  visibility: string;
  due_date: string | null;
  completed_at: string | null;
  job_id: string | null;
  request_type: string | null;
  target_folder: string | null;
  file_tags: string[] | null;
  is_verified: boolean | null;
  verified_at: string | null;
  verified_by: string | null;
  conditional_visibility: Record<string, unknown> | null;
  source_template_task_id: string | null;
  sort_order: number | null;
}

interface RecordsRequestManagerProps {
  jobId: string;
  mode: "accountant" | "client";
}

export function RecordsRequestManager({ jobId, mode }: RecordsRequestManagerProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<ClientTask | null>(null);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);

  // Fetch client tasks for this job
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["job-records-requests", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select("*")
        .eq("job_id", jobId)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return (data || []) as ClientTask[];
    },
  });

  // Verify task mutation
  const verifyMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("client_tasks")
        .update({
          is_verified: true,
          verified_at: new Date().toISOString(),
          verified_by: user?.id,
        })
        .eq("id", taskId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-records-requests", jobId] });
      toast.success("Item verified");
      setShowVerifyDialog(false);
      setSelectedTask(null);
    },
    onError: (error) => {
      toast.error("Failed to verify item");
      console.error(error);
    },
  });

  // Unverify task mutation
  const unverifyMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("client_tasks")
        .update({
          is_verified: false,
          verified_at: null,
          verified_by: null,
        })
        .eq("id", taskId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-records-requests", jobId] });
      toast.success("Verification removed");
    },
  });

  // Calculate progress
  const totalItems = tasks?.length || 0;
  const completedItems = tasks?.filter((t) => t.status === "completed" || t.is_verified).length || 0;
  const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  const getStatusIcon = (task: ClientTask) => {
    if (task.is_verified) {
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    }
    if (task.status === "completed") {
      return <Check className="h-4 w-4 text-blue-600" />;
    }
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusBadge = (task: ClientTask) => {
    if (task.is_verified) {
      return (
        <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Verified
        </Badge>
      );
    }
    if (task.status === "completed") {
      return (
        <Badge variant="secondary">
          <Upload className="h-3 w-3 mr-1" />
          Uploaded
        </Badge>
      );
    }
    return (
      <Badge variant="outline">
        <Clock className="h-3 w-3 mr-1" />
        Pending
      </Badge>
    );
  };

  const getRequestTypeBadge = (type: string | null) => {
    switch (type) {
      case "document":
        return <Badge variant="outline"><FileText className="h-3 w-3 mr-1" />Document</Badge>;
      case "questionnaire":
        return <Badge variant="outline"><MessageSquare className="h-3 w-3 mr-1" />Questionnaire</Badge>;
      case "information":
        return <Badge variant="outline"><Info className="h-3 w-3 mr-1" />Information</Badge>;
      default:
        return <Badge variant="outline">Request</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading records requests...
        </CardContent>
      </Card>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No records requests</p>
          <p className="text-sm mt-1">
            No document or information requests have been added to this job.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5" />
              Records Requests
            </CardTitle>
            <CardDescription>
              {completedItems} of {totalItems} items completed
            </CardDescription>
          </div>
          {mode === "accountant" && (
            <Button variant="outline" size="sm" disabled>
              <Bell className="h-4 w-4 mr-2" />
              Send Reminder
              {/* TODO: Wire to Phase 8 automation */}
            </Button>
          )}
        </div>
        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progressPercent}% complete</span>
            <span>
              {tasks.filter((t) => t.is_verified).length} verified
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2">
            {tasks.map((task, index) => (
              <div
                key={task.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  task.is_verified
                    ? "bg-green-500/5 border-green-500/20"
                    : task.status === "completed"
                    ? "bg-blue-500/5 border-blue-500/20"
                    : "bg-background hover:bg-muted/50"
                }`}
              >
                {mode === "accountant" && (
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0 mt-1" />
                )}
                
                <div className="shrink-0 mt-0.5">
                  {getStatusIcon(task)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{task.title}</div>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {task.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {getStatusBadge(task)}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-2">
                    {getRequestTypeBadge(task.request_type)}
                    {task.conditional_visibility && (
                      <Badge variant="outline" className="text-xs">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Conditional
                      </Badge>
                    )}
                    {task.verified_at && (
                      <span className="text-xs text-muted-foreground">
                        Verified {format(new Date(task.verified_at), "dd MMM yyyy")}
                      </span>
                    )}
                  </div>
                </div>

                {mode === "accountant" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Eye className="h-4 w-4 mr-2" />
                        View Documents
                      </DropdownMenuItem>
                      {task.is_verified ? (
                        <DropdownMenuItem onClick={() => unverifyMutation.mutate(task.id)}>
                          <AlertCircle className="h-4 w-4 mr-2" />
                          Remove Verification
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedTask(task);
                            setShowVerifyDialog(true);
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Mark as Verified
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {mode === "client" && task.status !== "completed" && (
                  <Button variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>

      {/* Verify Confirmation Dialog */}
      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Document</DialogTitle>
            <DialogDescription>
              Confirm that you have reviewed "{selectedTask?.title}" and it meets requirements.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVerifyDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedTask && verifyMutation.mutate(selectedTask.id)}
              disabled={verifyMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
