import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { EditQueuedEmailDialog } from "@/components/email/EditQueuedEmailDialog";
import { ComposeEmailDialog } from "@/components/email/ComposeEmailDialog";
import {
  Search,
  Filter,
  MoreHorizontal,
  RefreshCw,
  Mail,
  AlertCircle,
  Clock,
  XCircle,
  Eye,
  Pencil,
  RotateCw,
  Trash2,
  Plus,
  Play,
  Loader2,
  Send,
} from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

type EmailStatus = "draft" | "queued" | "pending" | "failed" | "ignored";

interface QueuedEmail {
  id: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  status: EmailStatus;
  context: string | null;
  error_message: string | null;
  scheduled_at: string | null;
  created_at: string | null;
  client_id: string | null;
  company_id: string | null;
  job_id: string | null;
  clients: { first_name: string; last_name: string } | null;
  companies: { company_name: string } | null;
}

const statusConfig: Record<EmailStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Mail }> = {
  draft: { label: "Draft", variant: "outline", icon: Pencil },
  queued: { label: "Queued", variant: "secondary", icon: Clock },
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  failed: { label: "Failed", variant: "destructive", icon: XCircle },
  ignored: { label: "Ignored", variant: "outline", icon: Eye },
};

const contextLabels: Record<string, string> = {
  quote: "Quote",
  onboarding: "Onboarding",
  engagement: "Engagement Letter",
  job: "Job",
  invoice: "Invoice",
  system: "System",
  general: "General",
};

export default function Emails() {
  const { organization } = useOrganization();
  const { toast: toastHook } = useToast();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [contextFilter, setContextFilter] = useState<string>("all");
  const [selectedEmail, setSelectedEmail] = useState<QueuedEmail | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch email queue
  const { data: emails, isLoading, refetch } = useQuery({
    queryKey: ["email-queue", organization?.id, statusFilter, contextFilter, searchQuery],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      let query = supabase
        .from("email_queue")
        .select(`
          id,
          to_email,
          to_name,
          subject,
          body_html,
          body_text,
          status,
          context,
          error_message,
          scheduled_at,
          created_at,
          client_id,
          company_id,
          job_id,
          clients(first_name, last_name),
          companies(company_name)
        `)
        .eq("organization_id", organization.id)
        .neq("status", "sent")
        .order("created_at", { ascending: false });

      if (statusFilter === "queued") {
        query = query.in("status", ["queued", "pending"]);
      } else if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      
      if (contextFilter !== "all") {
        query = query.eq("context", contextFilter);
      }

      if (searchQuery) {
        query = query.or(`to_email.ilike.%${searchQuery}%,subject.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query.limit(100);
      
      if (error) throw error;
      return data as QueuedEmail[];
    },
    enabled: !!organization?.id,
  });

  // Process queue manually
  const processQueueMutation = useMutation({
    mutationFn: async () => {
      setIsProcessing(true);
      if (organization?.id) {
        await supabase.rpc("flush_email_queue_now", { p_organization_id: organization.id });
      }
      const { data, error } = await supabase.functions.invoke("process-email-queue");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Queue processed: ${data?.processed || 0} sent, ${data?.failed || 0} failed`);
      queryClient.invalidateQueries({ queryKey: ["email-queue"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to process queue: ${error.message}`);
    },
    onSettled: () => {
      setIsProcessing(false);
    },
  });

  // Send a single queued email immediately (overrides its scheduled_at).
  const sendNowMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const { error: rpcError } = await supabase.rpc("send_queued_email_now", { p_email_id: emailId });
      if (rpcError) throw rpcError;
      const { error: fnError } = await supabase.functions.invoke("process-email-queue");
      if (fnError) throw fnError;
    },
    onSuccess: () => {
      toast.success("Email sent");
      queryClient.invalidateQueries({ queryKey: ["email-queue"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to send email: ${error.message}`);
    },
  });

  // Retry failed email mutation
  const retryMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const { error } = await supabase
        .from("email_queue")
        // email_queue_status_check: pending/sent/failed/cancelled.
        .update({ status: "pending", error_message: null })
        .eq("id", emailId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toastHook({ title: "Email re-queued for sending" });
      queryClient.invalidateQueries({ queryKey: ["email-queue"] });
    },
    onError: () => {
      toastHook({ title: "Failed to retry email", variant: "destructive" });
    },
  });

  // Retry all failed emails mutation
  const retryAllFailedMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("email_queue")
        .update({ status: "pending", error_message: null, retry_count: 0 })
        .eq("status", "failed")
        .eq("organization_id", organization?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All failed emails re-queued for sending");
      queryClient.invalidateQueries({ queryKey: ["email-queue"] });
    },
    onError: () => {
      toast.error("Failed to retry emails");
    },
  });

  // Delete/Cancel email mutation
  const deleteMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const { error } = await supabase
        .from("email_queue")
        .delete()
        .eq("id", emailId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toastHook({ title: "Email removed from queue" });
      queryClient.invalidateQueries({ queryKey: ["email-queue"] });
    },
    onError: () => {
      toastHook({ title: "Failed to delete email", variant: "destructive" });
    },
  });

  // Mark as ignored mutation
  const ignoreMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const { error } = await supabase
        .from("email_queue")
        // "ignored" is not in email_queue_status_check; mark as cancelled.
        .update({ status: "cancelled" })
        .eq("id", emailId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toastHook({ title: "Email marked as ignored" });
      queryClient.invalidateQueries({ queryKey: ["email-queue"] });
    },
    onError: () => {
      toastHook({ title: "Failed to update email", variant: "destructive" });
    },
  });

  const handleEditEmail = (email: QueuedEmail) => {
    setSelectedEmail(email);
    setIsEditDialogOpen(true);
  };

  const getClientName = (email: QueuedEmail): string => {
    if (email.clients) {
      return `${email.clients.first_name} ${email.clients.last_name}`;
    }
    if (email.companies) {
      return email.companies.company_name;
    }
    return "-";
  };

  const filterByStatus = (status: EmailStatus | "all") => {
    if (status === "all") return emails || [];
    return (emails || []).filter(e => e.status === status);
  };

  const counts = {
    draft: filterByStatus("draft").length,
    queued: filterByStatus("queued").length + (emails || []).filter(e => e.status === "pending").length,
    failed: filterByStatus("failed").length,
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Emails</h1>
            <p className="text-muted-foreground mt-1">
              Manage outgoing emails across your firm
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => processQueueMutation.mutate()}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Process Queue
            </Button>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => setIsComposeOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Compose
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card 
            className={`cursor-pointer transition-all hover:border-primary/50 ${statusFilter === "draft" ? "border-primary ring-1 ring-primary" : ""}`}
            onClick={() => setStatusFilter("draft")}
          >
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-secondary/50 rounded-lg">
                  <Pencil className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{counts.draft}</p>
                  <p className="text-sm text-muted-foreground">Drafts</p>
                </div>
              </div>
          </CardContent>
        </Card>
        
        {/* Retry All Failed Button */}
        {counts.failed > 0 && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => retryAllFailedMutation.mutate()}
            disabled={retryAllFailedMutation.isPending}
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <RotateCw className={`h-4 w-4 mr-2 ${retryAllFailedMutation.isPending ? 'animate-spin' : ''}`} />
            Retry All Failed ({counts.failed})
          </Button>
        )}
          <Card 
            className={`cursor-pointer transition-all hover:border-primary/50 ${statusFilter === "queued" ? "border-primary ring-1 ring-primary" : ""}`}
            onClick={() => setStatusFilter("queued")}
          >
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{counts.queued}</p>
                  <p className="text-sm text-muted-foreground">Queued</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all hover:border-primary/50 ${statusFilter === "failed" ? "border-primary ring-1 ring-primary" : ""}`}
            onClick={() => setStatusFilter("failed")}
          >
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-destructive/10 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{counts.failed}</p>
                  <p className="text-sm text-muted-foreground">Failed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle>Email Queue</CardTitle>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search emails..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
                <Select value={contextFilter} onValueChange={setContextFilter}>
                  <SelectTrigger className="w-36">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Context" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Contexts</SelectItem>
                    <SelectItem value="quote">Quote</SelectItem>
                    <SelectItem value="onboarding">Onboarding</SelectItem>
                    <SelectItem value="engagement">Engagement Letter</SelectItem>
                    <SelectItem value="job">Job</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
              <div className="border-b px-4">
                <TabsList className="h-12 bg-transparent">
                  <TabsTrigger value="all" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                    All ({emails?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="draft" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                    Drafts ({counts.draft})
                  </TabsTrigger>
                  <TabsTrigger value="queued" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                    Queued ({counts.queued})
                  </TabsTrigger>
                  <TabsTrigger value="failed" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                    Failed ({counts.failed})
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="min-h-[400px]">
                {isLoading ? (
                  <div className="p-6 space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : !emails?.length ? (
                  <div className="p-12 text-center">
                    <Mail className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium text-muted-foreground">No emails found</h3>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      Emails will appear here when queued for sending
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Context</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Scheduled For</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emails.map((email) => {
                        const status = (email.status as EmailStatus) || "queued";
                        const config = statusConfig[status];
                        const StatusIcon = config.icon;
                        
                        return (
                          <TableRow key={email.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{email.to_name || email.to_email}</p>
                                {email.to_name && (
                                  <p className="text-sm text-muted-foreground">{email.to_email}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[300px]">
                              <p className="truncate">{email.subject}</p>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm">{getClientName(email)}</p>
                            </TableCell>
                            <TableCell>
                              {email.context && (
                                <Badge variant="outline">
                                  {contextLabels[email.context] || email.context}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={config.variant} className="gap-1">
                                <StatusIcon className="h-3 w-3" />
                                {config.label}
                              </Badge>
                              {email.error_message && status === "failed" && (
                                <p className="text-xs text-destructive mt-1 max-w-[200px] truncate" title={email.error_message}>
                                  {email.error_message}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              <p className="text-sm text-muted-foreground">
                                {email.created_at 
                                  ? format(new Date(email.created_at), "dd MMM yyyy HH:mm")
                                  : "-"
                                }
                              </p>
                            </TableCell>
                            <TableCell>
                              {email.scheduled_at ? (
                                <div className="text-sm">
                                  <p>{format(new Date(email.scheduled_at), "dd MMM yyyy HH:mm")}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(email.scheduled_at).getTime() <= Date.now()
                                      ? "Ready"
                                      : `In ${formatDistanceToNowStrict(new Date(email.scheduled_at))}`}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {(status === "draft" || status === "queued" || status === "pending" || status === "failed") && (
                                    <DropdownMenuItem
                                      onClick={() => sendNowMutation.mutate(email.id)}
                                      disabled={sendNowMutation.isPending}
                                    >
                                      <Send className="h-4 w-4 mr-2" />
                                      Send Now
                                    </DropdownMenuItem>
                                  )}
                                  {(status === "draft" || status === "queued") && (
                                    <DropdownMenuItem onClick={() => handleEditEmail(email)}>
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                  )}
                                  {status === "failed" && (
                                    <>
                                      <DropdownMenuItem onClick={() => handleEditEmail(email)}>
                                        <Pencil className="h-4 w-4 mr-2" />
                                        Edit & Retry
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => retryMutation.mutate(email.id)}>
                                        <RotateCw className="h-4 w-4 mr-2" />
                                        Retry
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  <DropdownMenuItem onClick={() => handleEditEmail(email)}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => ignoreMutation.mutate(email.id)}>
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Ignore
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => deleteMutation.mutate(email.id)}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Edit Email Dialog */}
      <EditQueuedEmailDialog
        email={selectedEmail}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["email-queue"] });
          setIsEditDialogOpen(false);
          setSelectedEmail(null);
        }}
      />

      {/* Compose Email Dialog */}
      <ComposeEmailDialog
        open={isComposeOpen}
        onOpenChange={setIsComposeOpen}
      />
    </DashboardLayout>
  );
}