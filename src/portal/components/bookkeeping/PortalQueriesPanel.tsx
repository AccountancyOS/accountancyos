import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";
import { usePortalEntity } from "../../contexts/PortalEntityContext";

/**
 * Lightweight queries inbox shown on the client bookkeeping overview.
 * Surfaces accountant-originated, client-visible messages and lets the client
 * reply inline. Replies are stored in `client_messages` with sender_type =
 * 'client' and parent_message_id pointing at the original query.
 */
export function PortalQueriesPanel() {
  const { currentEntity } = usePortalEntity();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const entityCol = currentEntity?.type === "client" ? "client_id" : "company_id";

  const queryKey = ["portal-queries", currentEntity?.type, currentEntity?.id];

  const { data: queries = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!currentEntity) return [];
      const { data, error } = await supabase
        .from("client_messages")
        .select("id, subject, content, sender_type, created_at, parent_message_id, organization_id, client_id, company_id")
        .eq(entityCol, currentEntity.id)
        .neq("sender_type", "client")
        .eq("visibility", "client_visible")
        .is("parent_message_id", null)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentEntity,
  });

  const reply = useMutation({
    mutationFn: async (parent: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("client_messages").insert({
        organization_id: parent.organization_id,
        client_id: parent.client_id,
        company_id: parent.company_id,
        sender_id: user.id,
        sender_type: "client",
        message_type: "note",
        visibility: "client_visible",
        subject: parent.subject ? `Re: ${parent.subject}` : null,
        content: replyText,
        parent_message_id: parent.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Reply Sent", description: "Your accountant has been notified." });
      setReplyTo(null);
      setReplyText("");
    },
    onError: (e: any) => {
      toast({ title: "Send Failed", description: e.message, variant: "destructive" });
    },
  });

  if (queries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" /> Queries From Your Accountant
        </CardTitle>
        <CardDescription>
          Quick questions your accountant has sent. Reply here to keep everything in one place.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {queries.map((q: any) => (
          <div key={q.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {q.subject && <p className="text-sm font-medium">{q.subject}</p>}
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{q.content}</p>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                {new Date(q.created_at).toLocaleDateString()}
              </Badge>
            </div>

            {replyTo === q.id ? (
              <div className="space-y-2">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply..."
                  rows={3}
                />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => { setReplyTo(null); setReplyText(""); }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => reply.mutate(q)}
                    disabled={!replyText.trim() || reply.isPending}
                  >
                    {reply.isPending ? "Sending..." : "Send Reply"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setReplyTo(q.id)}>
                  Reply
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}