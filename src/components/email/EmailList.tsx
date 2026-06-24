import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmailSearch } from "./EmailSearch";
import { EmailViewer } from "./EmailViewer";
import { format } from "date-fns";
import { formatDistanceToNowStrict } from "date-fns";
import { Mail, ArrowLeft, ArrowRight, Briefcase, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailListProps {
  clientId?: string;
  companyId?: string;
  jobId?: string;
  leadId?: string;
  recipientEmail?: string;
  showQueue?: boolean;
  title?: string;
}

const CONTEXT_LABELS: Record<string, string> = {
  quote: "Quote",
  onboarding: "Onboarding",
  engagement: "Engagement Letter",
  job: "Job",
  invoice: "Invoice",
  system: "System",
  general: "General",
};

const QUEUE_STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "secondary" },
  sent: { label: "Sent", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export function EmailList({
  clientId,
  companyId,
  jobId,
  leadId,
  recipientEmail,
  showQueue = false,
  title = "Emails",
}: EmailListProps) {
  const { organization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  const { data: emails, isLoading, refetch } = useQuery({
    queryKey: ["email-messages", organization?.id, clientId, companyId, jobId, leadId, recipientEmail, searchQuery],
    queryFn: async () => {
      if (!organization?.id) return [];

      let query = supabase
        .from("email_messages")
        .select(`
          *,
          clients:client_id(first_name, last_name),
          companies:company_id(company_name),
          jobs:job_id(job_name)
        `)
        .eq("organization_id", organization.id)
        .order("sent_at", { ascending: false, nullsFirst: false });

      // Build inclusive OR filter across relational ids and optional address fallback.
      const orParts: string[] = [];
      if (clientId) orParts.push(`client_id.eq.${clientId}`);
      if (companyId) orParts.push(`company_id.eq.${companyId}`);
      if (jobId) orParts.push(`job_id.eq.${jobId}`);
      if (recipientEmail) {
        const safe = recipientEmail.replace(/"/g, "");
        orParts.push(`to_emails.cs.{"${safe}"}`);
        orParts.push(`from_email.eq.${safe}`);
      }
      if (leadId) {
        // matched_entities is a jsonb array; contains operator
        orParts.push(`matched_entities.cs.[{"type":"lead","id":"${leadId}"}]`);
      }
      if (orParts.length === 0) {
        // No filter provided — return nothing to avoid showing org-wide emails accidentally.
        return [];
      }
      query = query.or(orParts.join(","));

      // Full-text search using the search_vector column
      if (searchQuery.trim()) {
        // Convert search query to tsquery format
        const tsQuery = searchQuery
          .trim()
          .split(/\s+/)
          .map((word) => `${word}:*`)
          .join(" & ");
        query = query.textSearch("search_vector", tsQuery);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const { data: queueItems, isLoading: queueLoading } = useQuery({
    queryKey: ["email-queue-for-entity", organization?.id, clientId, companyId, jobId, leadId, recipientEmail],
    queryFn: async () => {
      if (!organization?.id) return [];
      let q = supabase
        .from("email_queue")
        .select("id, subject, to_email, to_name, status, scheduled_at, sent_at, last_error_message, error_message, mailbox_id, created_by, context, retry_count")
        .eq("organization_id", organization.id)
        .order("scheduled_at", { ascending: false, nullsFirst: false })
        .limit(25);

      const orParts: string[] = [];
      if (clientId) orParts.push(`client_id.eq.${clientId}`);
      if (companyId) orParts.push(`company_id.eq.${companyId}`);
      if (jobId) orParts.push(`job_id.eq.${jobId}`);
      if (leadId) orParts.push(`and(entity_type.eq.lead,entity_id.eq.${leadId})`);
      if (recipientEmail) orParts.push(`to_email.eq.${recipientEmail}`);
      if (orParts.length === 0) return [];
      q = q.or(orParts.join(","));

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id && showQueue,
  });

  // Show only outstanding items in the queue panel (pending/scheduled/failed); successful sends live in history.
  const outstandingQueue = (queueItems || []).filter(
    (q) => q.status === "pending" || q.status === "failed",
  );

  const selectedEmail = emails?.find((e) => e.id === selectedEmailId);

  return (
    <div className="space-y-4">
      {showQueue && outstandingQueue.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Outgoing — Pending or Failed
              <Badge variant="secondary" className="ml-1">{outstandingQueue.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {outstandingQueue.map((item) => {
              const status = QUEUE_STATUS_LABELS[item.status] ?? { label: item.status, variant: "outline" as const };
              const contextLabel = item.context ? CONTEXT_LABELS[item.context] : null;
              const when = item.scheduled_at || item.sent_at;
              const isFailed = item.status === "failed";
              return (
                <div key={item.id} className="border rounded-md p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{item.subject || "(No subject)"}</p>
                      <p className="text-muted-foreground text-xs truncate">
                        To {item.to_name ? `${item.to_name} <${item.to_email}>` : item.to_email}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant={status.variant} className="text-xs">
                          {isFailed ? <AlertCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                          {status.label}
                        </Badge>
                        {contextLabel && (
                          <Badge variant="outline" className="text-xs">{contextLabel}</Badge>
                        )}
                        {when && (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(when), "dd MMM yyyy HH:mm")}
                            {item.status === "pending" && item.scheduled_at && new Date(item.scheduled_at).getTime() > Date.now() && (
                              <> · sends in {formatDistanceToNowStrict(new Date(item.scheduled_at))}</>
                            )}
                          </span>
                        )}
                      </div>
                      {isFailed && (
                        <p className="text-xs text-destructive mt-1">
                          Failed to send — check email settings or retry from the Emails page.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
      {/* Email List */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {title}
          </CardTitle>
          <div className="pt-2">
            <EmailSearch
              onSearch={setSearchQuery}
              placeholder="Search subject, sender, content..."
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0">
          <ScrollArea className="h-[500px]">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : !emails?.length ? (
              <div className="p-8 text-center text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>
                  {leadId
                    ? "No AccountancyOS emails recorded for this lead yet."
                    : clientId || companyId
                    ? "No AccountancyOS emails recorded for this client yet."
                    : "No emails found"}
                </p>
                {searchQuery && (
                  <p className="text-sm mt-1">Try adjusting your search</p>
                )}
              </div>
            ) : (
              <div className="divide-y">
                {emails.map((email) => {
                  const timestamp =
                    email.direction === "outbound"
                      ? email.sent_at
                      : email.received_at;
                  const clientName = email.clients
                    ? `${email.clients.first_name} ${email.clients.last_name}`
                    : null;
                  const companyName = email.companies?.company_name;

                  return (
                    <button
                      key={email.id}
                      onClick={() => setSelectedEmailId(email.id)}
                      className={cn(
                        "w-full text-left p-4 hover:bg-muted/50 transition-colors",
                        selectedEmailId === email.id && "bg-muted",
                        !email.is_read &&
                          email.direction === "inbound" &&
                          "bg-primary/5"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {email.direction === "inbound" ? (
                            <ArrowLeft className="h-4 w-4 text-blue-500" />
                          ) : (
                            <ArrowRight className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className={cn(
                                "text-sm truncate",
                                !email.is_read &&
                                  email.direction === "inbound" &&
                                  "font-semibold"
                              )}
                            >
                              {email.from_name || email.from_email}
                            </p>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {timestamp
                                ? format(new Date(timestamp), "dd MMM")
                                : "—"}
                            </span>
                          </div>
                          <p
                            className={cn(
                              "text-sm truncate",
                              !email.is_read &&
                                email.direction === "inbound"
                                ? "font-medium"
                                : "text-muted-foreground"
                            )}
                          >
                            {email.subject || "(No subject)"}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {clientName && (
                              <Badge variant="outline" className="text-xs">
                                {clientName}
                              </Badge>
                            )}
                            {companyName && (
                              <Badge variant="outline" className="text-xs">
                                {companyName}
                              </Badge>
                            )}
                            {email.jobs && (
                              <Badge variant="secondary" className="text-xs">
                                <Briefcase className="h-3 w-3 mr-1" />
                                {email.jobs.job_name}
                              </Badge>
                            )}
                            {!email.client_id && !email.company_id && recipientEmail && (
                              <Badge variant="outline" className="text-xs">Address match</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Email Viewer */}
      <div>
        {selectedEmail ? (
          <EmailViewer
            email={selectedEmail}
            clientName={
              selectedEmail.clients
                ? `${selectedEmail.clients.first_name} ${selectedEmail.clients.last_name}`
                : undefined
            }
            companyName={selectedEmail.companies?.company_name}
            onUpdated={() => refetch()}
          />
        ) : (
          <Card className="h-[600px] flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select an email to view</p>
            </div>
          </Card>
        )}
      </div>
    </div>
    </div>
  );
}
