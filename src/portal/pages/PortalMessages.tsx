import { useEffect, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalEntity } from "../contexts/PortalEntityContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";
import {
  usePortalConversations,
  usePortalMessages,
  useSendPortalMessage,
} from "../hooks/usePortalData";
import { markConversationRead } from "../utils/readState";
import { useQueryClient } from "@tanstack/react-query";

export default function PortalMessages() {
  const conversations = usePortalConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const messages = usePortalMessages(activeId);
  const send = useSendPortalMessage();
  const qc = useQueryClient();
  const { currentEntity } = usePortalEntity();

  // Open jobs for the current entity — a new conversation must be tied to one so every message is
  // ringfenced to a job both the client and accountant can identify. "Open" = anything not completed.
  const openJobs = useQuery({
    queryKey: ["portal", "open-jobs", currentEntity?.type, currentEntity?.id],
    queryFn: async () => {
      if (!currentEntity) return [] as { id: string; job_name: string }[];
      const col = currentEntity.type === "company" ? "company_id" : "client_id";
      const { data, error } = await supabase
        .from("jobs")
        .select("id, job_name")
        .eq(col, currentEntity.id)
        .neq("status", "completed")
        .order("filing_deadline", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; job_name: string }[];
    },
    enabled: !!currentEntity,
  });

  useEffect(() => {
    if (activeId && messages.data && messages.data.length > 0) {
      const last = messages.data[messages.data.length - 1].sentAt;
      markConversationRead(activeId, last);
      qc.invalidateQueries({ queryKey: ["portal", "conversations"] });
    }
  }, [activeId, messages.data, qc]);

  const list = conversations.data ?? [];
  const composing = activeId === null;

  const handleStartNew = async () => {
    if (!composeBody.trim() || !composeSubject) return;
    try {
      const newId = await send.mutateAsync({
        body: composeBody.trim(),
        subject: composeSubject || null,
        parentMessageId: null,
      });
      setComposeSubject("");
      setComposeBody("");
      setActiveId(newId);
      toast.success("Message sent.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send message.");
    }
  };

  const handleReply = async () => {
    if (!activeId || !replyBody.trim()) return;
    try {
      await send.mutateAsync({ body: replyBody.trim(), parentMessageId: activeId });
      setReplyBody("");
      toast.success("Reply sent.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send reply.");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader
        title="Messages"
        description="Conversations with your accountant."
        actions={
          <Button variant="outline" onClick={() => setActiveId(null)}>
            New Message
          </Button>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardContent className="p-0">
            {conversations.isLoading ? (
              <div className="p-4 space-y-3">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <div className="p-4">
                <p className="text-sm text-muted-foreground">No conversations yet.</p>
              </div>
            ) : (
              <div className="divide-y">
                {list.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      "w-full text-left p-4 hover:bg-muted transition-colors",
                      activeId === c.id && "bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("truncate text-sm", c.unreadCount > 0 ? "font-semibold" : "font-medium")}>
                        {c.subject}
                      </p>
                      {c.unreadCount > 0 && (
                        <Badge variant="default" className="h-5 px-1.5 text-[10px]">
                          New
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(c.lastMessageAt).toLocaleString("en-GB")}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-4">
            {composing ? (
              <>
                <h2 className="text-base font-medium">New Message</h2>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">Which job is this about?</label>
                  <Select value={composeSubject} onValueChange={setComposeSubject}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          openJobs.isLoading
                            ? "Loading your jobs…"
                            : (openJobs.data?.length ?? 0) === 0
                              ? "No open jobs"
                              : "Select a job…"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(openJobs.data ?? []).map((j) => (
                        <SelectItem key={j.id} value={j.job_name}>
                          {j.job_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  placeholder="Write your message…"
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  rows={6}
                />
                <div className="flex justify-end">
                  <Button
                    onClick={handleStartNew}
                    disabled={!composeBody.trim() || !composeSubject || send.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send
                  </Button>
                </div>
              </>
            ) : messages.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !messages.data || messages.data.length === 0 ? (
              <PortalEmptyState
                icon={MessageSquare}
                title="Conversation Empty"
                description="No messages in this conversation yet."
              />
            ) : (
              <>
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  {messages.data.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "rounded-lg p-3 max-w-[85%]",
                        m.sender === "client"
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "bg-muted",
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                      <p
                        className={cn(
                          "text-[10px] mt-2",
                          m.sender === "client"
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {new Date(m.sentAt).toLocaleString("en-GB")}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 pt-2 border-t">
                  <Textarea
                    placeholder="Write a reply…"
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={3}
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={handleReply}
                      disabled={!replyBody.trim() || send.isPending}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Reply
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}