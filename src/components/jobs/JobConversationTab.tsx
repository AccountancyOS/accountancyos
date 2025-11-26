import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface JobConversationTabProps {
  jobId: string;
}

export default function JobConversationTab({ jobId }: JobConversationTabProps) {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");

  const { data: messages, isLoading } = useQuery({
    queryKey: ["job-conversations", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_conversations")
        .select("*")
        .eq("job_id", jobId)
        .is("task_id", null)
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
        sender_id: user?.id,
        sender_type: "accountant",
        message: message.trim(),
        visibility: "client_visible",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-conversations", jobId] });
      setMessage("");
      toast.success("Message sent");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job Conversation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Messages */}
        <div className="space-y-3 min-h-[400px] max-h-[600px] overflow-y-auto p-4 bg-muted/30 rounded-lg">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Loading conversation...
            </p>
          ) : !messages || messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages yet. Start a conversation about this job.
            </p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender_type === "accountant" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-4 ${
                    msg.sender_type === "accountant"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                  <p className="text-xs opacity-70 mt-2">
                    {format(new Date(msg.created_at), "dd MMM yyyy, HH:mm")}
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
            rows={3}
            className="resize-none"
          />
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              disabled
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
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
