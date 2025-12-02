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
import { Mail, ArrowLeft, ArrowRight, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailListProps {
  clientId?: string;
  companyId?: string;
  jobId?: string;
  title?: string;
}

export function EmailList({ clientId, companyId, jobId, title = "Emails" }: EmailListProps) {
  const { organization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  const { data: emails, isLoading, refetch } = useQuery({
    queryKey: ["email-messages", organization?.id, clientId, companyId, jobId, searchQuery],
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

      if (clientId) {
        query = query.eq("client_id", clientId);
      }
      if (companyId) {
        query = query.eq("company_id", companyId);
      }
      if (jobId) {
        query = query.eq("job_id", jobId);
      }

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

  const selectedEmail = emails?.find((e) => e.id === selectedEmailId);

  return (
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
                <p>No emails found</p>
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
  );
}
