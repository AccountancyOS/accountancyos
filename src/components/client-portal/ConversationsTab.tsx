import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { 
  Mail, 
  MessageSquare, 
  StickyNote, 
  Send, 
  Tag,
  User,
  Building2,
  Plus,
  Filter
} from "lucide-react";

interface ConversationsTabProps {
  clientId?: string;
  companyId?: string;
}

interface MatchedEntity {
  entity_type: string;
  entity_id: string;
  entity_name: string;
  match_source: string;
}

interface TimelineItem {
  id: string;
  type: 'email' | 'message' | 'note';
  timestamp: string;
  direction: 'inbound' | 'outbound';
  subject?: string | null;
  content: string | null;
  from?: string;
  to?: string[];
  visibility?: string;
  senderType?: string;
  matchedEntities: MatchedEntity[];
  jobLinks?: Array<{ job_id: string; job_name: string }>;
}

export function ConversationsTab({ clientId, companyId }: ConversationsTabProps) {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [newMessage, setNewMessage] = useState("");
  const [messageType, setMessageType] = useState<"message" | "note">("message");
  const [filterType, setFilterType] = useState<"all" | "email" | "message" | "note">("all");

  // Fetch emails for this entity
  const { data: emails, isLoading: emailsLoading } = useQuery({
    queryKey: ["entity-emails", clientId, companyId, organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      let query = supabase
        .from("email_messages")
        .select("*")
        .eq("organization_id", organization.id);
      
      if (clientId) {
        query = query.eq("client_id", clientId);
      }
      if (companyId) {
        query = query.eq("company_id", companyId);
      }
      
      const { data, error } = await query.order("sent_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id && (!!clientId || !!companyId),
  });

  // Fetch portal messages for this entity
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["entity-messages", clientId, companyId, organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      let query = supabase
        .from("client_messages")
        .select("*")
        .eq("organization_id", organization.id);
      
      if (clientId) {
        query = query.eq("client_id", clientId);
      }
      if (companyId) {
        query = query.eq("company_id", companyId);
      }
      
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id && (!!clientId || !!companyId),
  });

  // Fetch jobs for tagging
  const { data: jobs } = useQuery({
    queryKey: ["entity-jobs", clientId, companyId, organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      let query = supabase
        .from("jobs")
        .select("id, job_name")
        .eq("organization_id", organization.id);
      
      if (clientId) {
        query = query.eq("client_id", clientId);
      }
      if (companyId) {
        query = query.eq("company_id", companyId);
      }
      
      const { data, error } = await query.order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id && (!!clientId || !!companyId),
  });

  // Fetch existing job links for messages
  const { data: jobLinks } = useQuery({
    queryKey: ["message-job-links", clientId, companyId, organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      const { data, error } = await supabase
        .from("message_entity_links")
        .select(`
          id,
          email_message_id,
          client_message_id,
          entity_id
        `)
        .eq("organization_id", organization.id)
        .eq("entity_type", "job");
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, type }: { content: string; type: "message" | "note" }) => {
      if (!organization?.id) throw new Error("No organization");
      
      const { error } = await supabase
        .from("client_messages")
        .insert({
          organization_id: organization.id,
          client_id: clientId || null,
          company_id: companyId || null,
          content,
          sender_type: "accountant",
          sender_id: user?.id,
          message_type: type,
          visibility: type === "note" ? "internal_only" : "client_visible",
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity-messages"] });
      setNewMessage("");
      toast({ title: messageType === "note" ? "Note added" : "Message sent" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Tag message to job mutation
  const tagToJobMutation = useMutation({
    mutationFn: async ({ 
      emailMessageId, 
      clientMessageId, 
      jobId 
    }: { 
      emailMessageId?: string; 
      clientMessageId?: string; 
      jobId: string;
    }) => {
      if (!organization?.id) throw new Error("No organization");
      
      const { error } = await supabase
        .from("message_entity_links")
        .insert({
          organization_id: organization.id,
          email_message_id: emailMessageId || null,
          client_message_id: clientMessageId || null,
          entity_type: "job",
          entity_id: jobId,
          tagged_by: user?.id,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-job-links"] });
      toast({ title: "Tagged to job" });
    },
    onError: (error: Error) => {
      if (error.message?.includes("duplicate")) {
        toast({ title: "Already tagged to this job" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  // Build unified timeline
  const timeline = useMemo((): TimelineItem[] => {
    const items: TimelineItem[] = [];
    
    // Add emails
    emails?.forEach(email => {
      const matchedEntities = (email.matched_entities as unknown as MatchedEntity[]) || [];
      const emailJobLinks = jobLinks?.filter(l => l.email_message_id === email.id) || [];
      
      items.push({
        id: email.id,
        type: 'email',
        timestamp: email.sent_at || email.received_at || email.created_at,
        direction: email.direction as 'inbound' | 'outbound',
        subject: email.subject,
        content: email.body_text || email.body_html,
        from: email.from_email,
        to: email.to_emails || [],
        matchedEntities,
        jobLinks: emailJobLinks.map(l => {
          const job = jobs?.find(j => j.id === l.entity_id);
          return { job_id: l.entity_id, job_name: job?.job_name || 'Unknown Job' };
        }),
      });
    });
    
    // Add portal messages
    messages?.forEach(msg => {
      const msgJobLinks = jobLinks?.filter(l => l.client_message_id === msg.id) || [];
      
      items.push({
        id: msg.id,
        type: msg.message_type === 'note' ? 'note' : 'message',
        timestamp: msg.created_at,
        direction: msg.sender_type === 'client' ? 'inbound' : 'outbound',
        subject: msg.subject,
        content: msg.content,
        visibility: msg.visibility,
        senderType: msg.sender_type,
        matchedEntities: [],
        jobLinks: msgJobLinks.map(l => {
          const job = jobs?.find(j => j.id === l.entity_id);
          return { job_id: l.entity_id, job_name: job?.job_name || 'Unknown Job' };
        }),
      });
    });
    
    // Sort by timestamp descending
    return items.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [emails, messages, jobLinks, jobs]);

  // Filter timeline
  const filteredTimeline = useMemo(() => {
    if (filterType === "all") return timeline;
    return timeline.filter(item => item.type === filterType);
  }, [timeline, filterType]);

  const isLoading = emailsLoading || messagesLoading;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'email': return <Mail className="h-4 w-4" />;
      case 'message': return <MessageSquare className="h-4 w-4" />;
      case 'note': return <StickyNote className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'email': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'message': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      case 'note': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4">
      {/* Compose Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="h-5 w-5" />
            New Message
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Select value={messageType} onValueChange={(v) => setMessageType(v as "message" | "note")}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="message">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Portal Message
                  </div>
                </SelectItem>
                <SelectItem value="note">
                  <div className="flex items-center gap-2">
                    <StickyNote className="h-4 w-4" />
                    Internal Note
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline" className="self-center">
              {messageType === "note" ? "Internal Only" : "Client Visible"}
            </Badge>
          </div>
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={messageType === "note" ? "Add an internal note..." : "Write a message to the client..."}
            rows={3}
          />
          <div className="flex justify-end">
            <Button
              onClick={() => sendMessageMutation.mutate({ content: newMessage, type: messageType })}
              disabled={!newMessage.trim() || sendMessageMutation.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              {messageType === "note" ? "Add Note" : "Send Message"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Conversations</CardTitle>
            <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
              <SelectTrigger className="w-[140px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="email">Emails</SelectItem>
                <SelectItem value="message">Messages</SelectItem>
                <SelectItem value="note">Notes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : filteredTimeline.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No conversations yet
            </p>
          ) : (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                {filteredTimeline.map(item => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-lg border ${
                      item.type === 'note' 
                        ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' 
                        : item.direction === 'inbound'
                          ? 'bg-muted/30'
                          : 'bg-background'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={getTypeColor(item.type)}>
                          {getTypeIcon(item.type)}
                          <span className="ml-1 capitalize">{item.type}</span>
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {item.direction === 'inbound' ? '← Inbound' : '→ Outbound'}
                        </Badge>
                        {item.type === 'note' && (
                          <Badge variant="outline" className="text-xs bg-amber-100 dark:bg-amber-900/30">
                            Internal
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(item.timestamp), "dd MMM yyyy HH:mm")}
                      </span>
                    </div>

                    {/* Email metadata */}
                    {item.type === 'email' && (
                      <div className="text-sm text-muted-foreground mb-2 space-y-1">
                        {item.from && <div>From: {item.from}</div>}
                        {item.to && item.to.length > 0 && <div>To: {item.to.join(", ")}</div>}
                      </div>
                    )}

                    {/* Subject */}
                    {item.subject && (
                      <div className="font-medium mb-1">{item.subject}</div>
                    )}

                    {/* Content */}
                    <div className="text-sm text-muted-foreground line-clamp-3">
                      {item.content?.replace(/<[^>]*>/g, '') || 'No content'}
                    </div>

                    {/* Multi-entity chips */}
                    {item.matchedEntities && item.matchedEntities.length > 1 && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                        <span className="text-xs text-muted-foreground">Linked to:</span>
                        {item.matchedEntities.map((entity, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {entity.entity_type === 'client' ? (
                              <User className="h-3 w-3 mr-1" />
                            ) : (
                              <Building2 className="h-3 w-3 mr-1" />
                            )}
                            {entity.entity_name} ({entity.entity_type})
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Job links and tagging */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                      {item.jobLinks && item.jobLinks.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Tag className="h-3 w-3 text-muted-foreground" />
                          {item.jobLinks.map((link, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {link.job_name}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 px-2">
                            <Tag className="h-3 w-3 mr-1" />
                            Tag to Job
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuLabel>Select Job</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {jobs && jobs.length > 0 ? (
                            jobs.map(job => (
                              <DropdownMenuItem
                                key={job.id}
                                onClick={() => tagToJobMutation.mutate({
                                  emailMessageId: item.type === 'email' ? item.id : undefined,
                                  clientMessageId: item.type !== 'email' ? item.id : undefined,
                                  jobId: job.id,
                                })}
                              >
                                {job.job_name}
                              </DropdownMenuItem>
                            ))
                          ) : (
                            <DropdownMenuItem disabled>No jobs available</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
