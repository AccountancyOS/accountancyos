import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Send, Mail, MessageSquare, FileText } from "lucide-react";

interface ClientMessagesTabProps {
  clientId: string;
}

export default function ClientMessagesTab({ clientId }: ClientMessagesTabProps) {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newMessage, setNewMessage] = useState("");
  const [messageType, setMessageType] = useState<"message" | "email" | "note">("message");
  const [visibility, setVisibility] = useState<"client_visible" | "internal_only">("client_visible");
  const [filterType, setFilterType] = useState("all");
  const [filterVisibility, setFilterVisibility] = useState("all");

  const { data: messages, isLoading } = useQuery({
    queryKey: ["client-messages-full", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_messages")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !user?.id || !newMessage.trim()) {
        throw new Error("Missing required fields");
      }

      const { error } = await supabase.from("client_messages").insert({
        organization_id: organization.id,
        client_id: clientId,
        sender_id: user.id,
        sender_type: "staff",
        message_type: messageType,
        visibility,
        content: newMessage.trim(),
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-messages-full", clientId] });
      queryClient.invalidateQueries({ queryKey: ["client-messages", clientId] });
      setNewMessage("");
      toast({
        title: "Success",
        description: "Message sent",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredMessages = messages?.filter((msg) => {
    const matchesType = filterType === "all" || msg.message_type === filterType;
    const matchesVisibility = filterVisibility === "all" || msg.visibility === filterVisibility;
    return matchesType && matchesVisibility;
  });

  return (
    <div className="space-y-6">
      {/* Compose Message */}
      <Card>
        <CardHeader>
          <CardTitle>Send Message</CardTitle>
          <CardDescription>
            Communicate with the client via portal message, email, or internal note
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="message-type">Message Type</Label>
              <Select value={messageType} onValueChange={(v) => setMessageType(v as any)}>
                <SelectTrigger id="message-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="message">Portal Message</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="note">Internal Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="visibility">Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as any)}>
                <SelectTrigger id="visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client_visible">Visible to Client</SelectItem>
                  <SelectItem value="internal_only">Internal Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              rows={4}
            />
          </div>
          <Button
            onClick={() => sendMessageMutation.mutate()}
            disabled={!newMessage.trim() || sendMessageMutation.isPending}
          >
            <Send className="mr-2 h-4 w-4" />
            {sendMessageMutation.isPending ? "Sending..." : "Send Message"}
          </Button>
        </CardContent>
      </Card>

      {/* Message Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Message History</CardTitle>
              <CardDescription>
                All communication with this client
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="message">Messages</SelectItem>
                  <SelectItem value="email">Emails</SelectItem>
                  <SelectItem value="note">Notes</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterVisibility} onValueChange={setFilterVisibility}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Messages</SelectItem>
                  <SelectItem value="client_visible">Client Visible</SelectItem>
                  <SelectItem value="internal_only">Internal Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-muted-foreground">Loading messages...</p>
          ) : filteredMessages && filteredMessages.length > 0 ? (
            <div className="space-y-4">
              {filteredMessages.map((message) => {
                const Icon = 
                  message.message_type === "email" ? Mail :
                  message.message_type === "note" ? FileText : MessageSquare;
                
                return (
                  <div key={message.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <Badge variant={
                          message.message_type === "email" ? "default" :
                          message.message_type === "note" ? "secondary" : "outline"
                        }>
                          {message.message_type}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {message.sender_type}
                        </Badge>
                        {message.visibility === "internal_only" && (
                          <Badge variant="secondary" className="text-xs">
                            Internal Only
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(message.created_at).toLocaleString()}
                      </span>
                    </div>
                    {message.subject && (
                      <p className="font-semibold">{message.subject}</p>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              No messages found
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
