import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PortalLayout from "@/components/portal/PortalLayout";
import { usePortal } from "@/lib/portal-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Send, User, Building2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function PortalMessages() {
  const { currentSpace, user } = usePortal();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState("");
  const [subject, setSubject] = useState("");

  const entityType = currentSpace?.type || 'client';
  const entityId = currentSpace?.id || '';

  const { data: messages, isLoading } = useQuery({
    queryKey: ['portal-messages', entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_messages')
        .select('*')
        .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
        .eq('visibility', 'client_visible')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!entityId
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      // Get organization_id from the entity
      const entityTable = entityType === 'client' ? 'clients' : 'companies';
      const { data: entityData } = await supabase
        .from(entityTable)
        .select('organization_id')
        .eq('id', entityId)
        .single();

      if (!entityData) throw new Error('Entity not found');

      const { error } = await supabase
        .from('client_messages')
        .insert({
          organization_id: entityData.organization_id,
          [entityType === 'client' ? 'client_id' : 'company_id']: entityId,
          sender_type: 'client',
          sender_id: user?.id,
          subject: subject || null,
          content: newMessage,
          visibility: 'client_visible',
          message_type: 'message'
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-messages'] });
      setNewMessage("");
      setSubject("");
      toast.success('Message sent');
    },
    onError: () => {
      toast.error('Failed to send message');
    }
  });

  if (!currentSpace) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No space selected</p>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Messages</h1>
          <p className="text-muted-foreground">Communicate with your accountant</p>
        </div>

        {/* New Message */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">New Message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Subject (optional)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Textarea
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              rows={4}
            />
            <Button
              onClick={() => sendMessageMutation.mutate()}
              disabled={!newMessage.trim() || sendMessageMutation.isPending}
            >
              <Send className="mr-2 h-4 w-4" />
              Send Message
            </Button>
          </CardContent>
        </Card>

        {/* Message History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Message History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : messages && messages.length > 0 ? (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`p-4 rounded-lg border ${
                      message.sender_type === 'client'
                        ? 'bg-primary/5 border-primary/20 ml-8'
                        : 'bg-muted mr-8'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {message.sender_type === 'client' ? (
                        <User className="h-4 w-4 text-primary" />
                      ) : (
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">
                        {message.sender_type === 'client' ? 'You' : 'Your Accountant'}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(message.created_at), 'dd MMM yyyy, HH:mm')}
                      </span>
                    </div>
                    {message.subject && (
                      <h4 className="font-medium mb-1">{message.subject}</h4>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No messages yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
