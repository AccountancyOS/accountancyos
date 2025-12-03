import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Clock, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { AddTaskDialog } from "./AddTaskDialog";

interface ClientPortalTabProps {
  clientId: string;
  onViewConversations?: () => void;
}

export default function ClientPortalTab({ clientId, onViewConversations }: ClientPortalTabProps) {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewAsClient, setViewAsClient] = useState(false);

  const { data: tasks } = useQuery({
    queryKey: ["client-tasks", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select("*")
        .eq("client_id", clientId)
        .order("task_order", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  // Use the same query key pattern as ConversationsTab for cache sync
  const { data: messages } = useQuery({
    queryKey: ["entity-messages", clientId, null, organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_messages")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
    enabled: !!clientId && !!organization?.id,
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const { error } = await supabase
        .from("client_tasks")
        .update({ 
          status,
          completed_at: status === "complete" ? new Date().toISOString() : null
        })
        .eq("id", taskId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-tasks", clientId] });
      toast({
        title: "Success",
        description: "Task status updated",
      });
    },
  });

  const visibleTasks = tasks?.filter(task => 
    !viewAsClient || task.visibility === "client_visible"
  );

  const visibleMessages = messages?.filter(message =>
    !viewAsClient || message.visibility === "client_visible"
  );

  return (
    <div className="space-y-6">
      {/* View as Client Toggle */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="view-as-client" className="text-base font-semibold">
                Preview Client View
              </Label>
              <p className="text-sm text-muted-foreground">
                See exactly what the client sees in their portal
              </p>
            </div>
            <Switch
              id="view-as-client"
              checked={viewAsClient}
              onCheckedChange={setViewAsClient}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Client Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Client Tasks</CardTitle>
              <CardDescription>
                {viewAsClient ? "Client-facing tasks" : "All tasks for this client"}
              </CardDescription>
            </div>
            {!viewAsClient && <AddTaskDialog clientId={clientId} />}
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleTasks && visibleTasks.length > 0 ? (
              visibleTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="pt-0.5">
                    {task.status === "complete" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : task.status === "in_progress" ? (
                      <Clock className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-start justify-between">
                      <p className="font-medium">{task.title}</p>
                      {!viewAsClient && task.visibility === "internal_only" && (
                        <Badge variant="secondary" className="text-xs">
                          Internal
                        </Badge>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground">
                        {task.description}
                      </p>
                    )}
                    {!viewAsClient && (
                      <div className="flex gap-2 mt-2">
                        {task.status !== "complete" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateTaskMutation.mutate({
                                taskId: task.id,
                                status: task.status === "not_started" ? "in_progress" : "complete",
                              })
                            }
                          >
                            {task.status === "not_started" ? "Start" : "Complete"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No tasks yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Messages */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Messages</CardTitle>
              <CardDescription>
                {viewAsClient ? "Visible to client" : "All messages and notes"}
              </CardDescription>
            </div>
            {!viewAsClient && onViewConversations && (
              <Button variant="outline" size="sm" onClick={onViewConversations}>
                <MessageSquare className="mr-2 h-4 w-4" />
                View All
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleMessages && visibleMessages.length > 0 ? (
              visibleMessages.map((message) => (
                <div
                  key={message.id}
                  className="p-3 border rounded-lg space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        message.message_type === "email" ? "default" :
                        message.message_type === "note" ? "secondary" : "outline"
                      }>
                        {message.message_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {message.sender_type}
                      </span>
                    </div>
                    {!viewAsClient && message.visibility === "internal_only" && (
                      <Badge variant="secondary" className="text-xs">
                        Internal
                      </Badge>
                    )}
                  </div>
                  {message.subject && (
                    <p className="font-medium text-sm">{message.subject}</p>
                  )}
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {message.content}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(message.created_at).toLocaleString()}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No messages yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Service Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Service Status</CardTitle>
          <CardDescription>
            High-level overview of work status per service
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Service status dashboard coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}
