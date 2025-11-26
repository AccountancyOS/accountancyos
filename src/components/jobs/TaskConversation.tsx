import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Send, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface TaskConversationProps {
  jobId: string;
  taskId: string;
  onClose: () => void;
}

export default function TaskConversation({ jobId, taskId, onClose }: TaskConversationProps) {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");

  const { data: messages, isLoading } = useQuery({
    queryKey: ["task-conversations", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_conversations")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !message.trim()) return;

      const { error } = await supabase.from("job_conversations").insert({
        organization_id: organization.id,
        job_id: jobId,
        task_id: taskId,
        sender_id: user?.id,
        sender_type: "accountant",
        message: message.trim(),
        visibility: "client_visible",
      });

      if (error) throw error;

      // Update task status to waiting_on_client
      await supabase
        .from("job_tasks")
        .update({ status: "doing" })
        .eq("id", taskId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-conversations", taskId] });
      queryClient.invalidateQueries({ queryKey: ["job-tasks", jobId] });
      setMessage("");
      toast.success("Message sent");
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">Task Conversation</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Messages */}
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Loading conversation...
            </p>
          ) : !messages || messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No messages yet. Start the conversation with your client.
            </p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender_type === "accountant" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.sender_type === "accountant"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {format(new Date(msg.created_at), "dd MMM, HH:mm")}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <Textarea
            placeholder="Type your message to the client..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (message.trim()) {
                  sendMessageMutation.mutate();
                }
              }
            }}
            rows={2}
            className="resize-none"
          />
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="h-8"
              onClick={() => sendMessageMutation.mutate()}
              disabled={!message.trim() || sendMessageMutation.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
