import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Mail, RefreshCw, CheckCircle2, XCircle, Clock, Plus, Trash2, MailCheck, AlertCircle, Key, Loader2, CreditCard, ExternalLink, FileText, Palette, Building2, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Settings() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  // Handle URL params for Gmail/Outlook callback success/error
  useEffect(() => {
    const gmailConnected = searchParams.get("gmail_connected");
    const outlookConnected = searchParams.get("outlook_connected");
    const error = searchParams.get("error");

    if (gmailConnected === "true") {
      toast.success("Gmail account connected successfully");
      queryClient.invalidateQueries({ queryKey: ["connected-mailboxes"] });
      setSearchParams({});
    } else if (outlookConnected === "true") {
      toast.success("Outlook account connected successfully");
      queryClient.invalidateQueries({ queryKey: ["connected-mailboxes"] });
      setSearchParams({});
    } else if (error) {
      const errorMessages: Record<string, string> = {
        invalid_state: "Invalid or expired session. Please try again.",
        token_exchange_failed: "Failed to connect. Please try again.",
        profile_fetch_failed: "Failed to fetch profile.",
        no_email: "Could not retrieve email address.",
        update_failed: "Failed to update existing connection.",
        create_failed: "Failed to create mailbox connection.",
        internal_error: "An unexpected error occurred.",
        access_denied: "Access was denied. Please try again.",
      };
      toast.error(errorMessages[error] || `Connection error: ${error}`);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, queryClient]);

  // Fetch connected mailboxes
  const { data: mailboxes, isLoading: mailboxesLoading } = useQuery({
    queryKey: ["connected-mailboxes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connected_mailboxes_safe")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Check if any mailbox is already connected
  const hasMailboxConnected = mailboxes && mailboxes.length > 0;

  // Fetch email queue stats
  const { data: queueStats } = useQuery({
    queryKey: ["email-queue-stats"],
    queryFn: async () => {
      const [pendingCount, sentCount, failedCount] = await Promise.all([
        supabase
          .from("email_queue")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("email_queue")
          .select("*", { count: "exact", head: true })
          .eq("status", "sent"),
        supabase
          .from("email_queue")
          .select("*", { count: "exact", head: true })
          .eq("status", "failed"),
      ]);

      return {
        pending: pendingCount.count || 0,
        sent: sentCount.count || 0,
        failed: failedCount.count || 0,
      };
    },
    refetchInterval: 10000,
  });

  // Fetch recent failed emails
  const { data: recentFailures } = useQuery({
    queryKey: ["email-queue-failures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_queue")
        .select("*")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
  });

  // Connect Gmail mutation
  const connectGmailMutation = useMutation({
    mutationFn: async () => {
      setIsConnecting(true);
      const { data, error } = await supabase.functions.invoke("gmail-auth", {
        body: { redirect_url: window.location.origin },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to initiate Gmail connection: ${error.message}`);
      setIsConnecting(false);
    },
  });

  // Connect Outlook mutation
  const connectOutlookMutation = useMutation({
    mutationFn: async () => {
      setIsConnecting(true);
      const { data, error } = await supabase.functions.invoke("outlook-auth", {
        body: { redirect_url: window.location.origin },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to initiate Outlook connection: ${error.message}`);
      setIsConnecting(false);
    },
  });

  // Disconnect mailbox mutation
  const disconnectMailboxMutation = useMutation({
    mutationFn: async (mailboxId: string) => {
      const { error } = await supabase
        .from("connected_mailboxes")
        .delete()
        .eq("id", mailboxId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mailbox disconnected");
      queryClient.invalidateQueries({ queryKey: ["connected-mailboxes"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to disconnect: ${error.message}`);
    },
  });

  // Sync mailbox mutation - uses correct sync function based on provider
  const syncMailboxMutation = useMutation({
    mutationFn: async ({ mailboxId, provider }: { mailboxId: string; provider: string }) => {
      setIsSyncing(mailboxId);
      const syncFunction = provider === 'outlook' ? 'outlook-sync' : 'gmail-sync';
      const { data, error } = await supabase.functions.invoke(syncFunction, {
        body: { mailbox_id: mailboxId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const synced = data.total_synced || 0;
      toast.success(`Sync complete: ${synced} new emails`);
      queryClient.invalidateQueries({ queryKey: ["connected-mailboxes"] });
    },
    onError: (error: Error) => {
      toast.error(`Sync failed: ${error.message}`);
    },
    onSettled: () => {
      setIsSyncing(null);
    },
  });

  // Process email queue mutation
  const processQueueMutation = useMutation({
    mutationFn: async () => {
      setIsProcessing(true);
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: { mode: "process_queue" },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Email queue processed: ${data.sent || 0} sent, ${data.failed || 0} failed`);
      queryClient.invalidateQueries({ queryKey: ["email-queue-stats"] });
      queryClient.invalidateQueries({ queryKey: ["email-queue-failures"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to process queue: ${error.message}`);
    },
    onSettled: () => {
      setIsProcessing(false);
    },
  });

  // Delete single failed email mutation
  const deleteFailedEmailMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const { error } = await supabase
        .from("email_queue")
        .delete()
        .eq("id", emailId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Failed email removed");
      queryClient.invalidateQueries({ queryKey: ["email-queue-stats"] });
      queryClient.invalidateQueries({ queryKey: ["email-queue-failures"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  // Clear all failed emails mutation
  const clearAllFailedMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("email_queue")
        .delete()
        .eq("status", "failed");

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All failed emails cleared");
      queryClient.invalidateQueries({ queryKey: ["email-queue-stats"] });
      queryClient.invalidateQueries({ queryKey: ["email-queue-failures"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to clear emails: ${error.message}`);
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case "expired":
        return <Badge variant="destructive">Expired</Badge>;
      case "revoked":
        return <Badge variant="destructive">Revoked</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage email integrations and system settings
          </p>
        </div>

        {/* Navigation Cards */}
        <div className="space-y-6">
          {/* Practice Setup */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Practice Setup</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card 
                className="cursor-pointer hover:border-primary transition-colors" 
                onClick={() => navigate("/settings/branding")}
              >
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <Palette className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle className="text-base">Branding</CardTitle>
                    <CardDescription className="text-sm">Logo, colors, and practice details</CardDescription>
                  </div>
                </CardHeader>
              </Card>
              <Card 
                className="cursor-pointer hover:border-primary transition-colors" 
                onClick={() => navigate("/settings/permissions")}
              >
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <Users className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle className="text-base">Team & Permissions</CardTitle>
                    <CardDescription className="text-sm">Manage roles and access control</CardDescription>
                  </div>
                </CardHeader>
              </Card>
              <Card 
                className="cursor-pointer hover:border-primary transition-colors" 
                onClick={() => navigate("/settings/email-templates")}
              >
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <Mail className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle className="text-base">Email Templates</CardTitle>
                    <CardDescription className="text-sm">Create and manage email templates</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </div>
          </div>

          {/* Filing & Integrations */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Filing & Integrations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card 
                className="cursor-pointer hover:border-primary transition-colors" 
                onClick={() => navigate("/settings/hmrc")}
              >
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle className="text-base">HMRC Integrations</CardTitle>
                    <CardDescription className="text-sm">MTD VAT, PAYE, Self Assessment</CardDescription>
                  </div>
                </CardHeader>
              </Card>
              <Card 
                className="cursor-pointer hover:border-primary transition-colors" 
                onClick={() => navigate("/settings/companies-house")}
              >
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <Building2 className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle className="text-base">Companies House</CardTitle>
                    <CardDescription className="text-sm">Filing credentials and presenter details</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>

        <Separator />

        {/* Connected Email Accounts */}
        <Card>
          <CardHeader>
              <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MailCheck className="h-5 w-5" />
                    Connected Email Accounts
                    {hasMailboxConnected && (
                      <Badge variant="default" className="bg-green-600 ml-2">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Connect your Gmail or Outlook to send and receive emails directly from AccountancyOS
                  </CardDescription>
                </div>
              </div>
              {!hasMailboxConnected && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => connectGmailMutation.mutate()}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Connect Gmail
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => connectOutlookMutation.mutate()}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Connect Outlook
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {mailboxesLoading ? (
              <div className="text-sm text-muted-foreground py-4">Loading...</div>
            ) : !mailboxes || mailboxes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No email accounts connected</p>
                <p className="text-sm mt-1">
                  Connect your Gmail to send emails from your real inbox
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {mailboxes.map((mailbox) => (
                  <div
                    key={mailbox.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Mail className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{mailbox.email_address}</span>
                          {getStatusBadge(mailbox.status)}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-3">
                          <span className="capitalize">{mailbox.provider}</span>
                          {mailbox.last_sync_at && (
                            <>
                              <span>•</span>
                              <span>
                                Last sync: {format(new Date(mailbox.last_sync_at), "dd MMM yyyy, HH:mm")}
                              </span>
                            </>
                          )}
                        </div>
                        {mailbox.error_message && (
                          <div className="flex items-center gap-1 text-sm text-destructive mt-1">
                            <AlertCircle className="h-3 w-3" />
                            {mailbox.error_message}
                          </div>
                        )}
                      </div>
                    </div>
                      <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncMailboxMutation.mutate({ mailboxId: mailbox.id, provider: mailbox.provider })}
                        disabled={isSyncing === mailbox.id || mailbox.status !== "active"}
                      >
                        <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing === mailbox.id ? "animate-spin" : ""}`} />
                        Sync
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Disconnect Email Account?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will disconnect {mailbox.email_address} from AccountancyOS.
                              Synced emails will be retained but you won't be able to send or receive new emails.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => disconnectMailboxMutation.mutate(mailbox.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Disconnect
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email Queue Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  System Email Queue
                </CardTitle>
                <CardDescription>
                  Automated system emails (portal invites, notifications) via Postmark
                </CardDescription>
              </div>
              <Button
                onClick={() => processQueueMutation.mutate()}
                disabled={isProcessing || (queueStats?.pending || 0) === 0}
                variant="outline"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isProcessing ? "animate-spin" : ""}`} />
                Process Now
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Queue Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Pending</span>
                </div>
                <div className="text-2xl font-bold">{queueStats?.pending || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Waiting to be sent
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">Sent</span>
                </div>
                <div className="text-2xl font-bold">{queueStats?.sent || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Successfully delivered
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium">Failed</span>
                </div>
                <div className="text-2xl font-bold">{queueStats?.failed || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Delivery errors
                </p>
              </div>
            </div>

            {/* Recent Failures */}
            {recentFailures && recentFailures.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Recent Failures</h4>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Clear All
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear All Failed Emails?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove all {queueStats?.failed || 0} failed emails from the queue.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => clearAllFailedMutation.mutate()}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Clear All
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <div className="space-y-2">
                  {recentFailures.map((email) => (
                    <div
                      key={email.id}
                      className="flex items-start gap-3 rounded-lg border p-3"
                    >
                      <XCircle className="h-4 w-4 text-destructive mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{email.to_email}</span>
                          <Badge variant="destructive" className="text-xs">
                            Failed
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {email.subject}
                        </p>
                        {email.error_message && (
                          <p className="text-xs text-destructive">
                            {email.error_message}
                          </p>
                        )}
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Failed Email?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove the failed email to {email.to_email} from the queue.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteFailedEmailMutation.mutate(email.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg bg-muted p-4 text-sm">
              <p className="font-medium mb-2">How it works:</p>
              <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                <li>System emails (invites, notifications) use Postmark</li>
                <li>Client communication uses connected mailboxes</li>
                <li>Cron job processes system queue every minute</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Job Templates Quick Link */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Job Templates
                </CardTitle>
                <CardDescription>
                  Create and manage reusable job templates for automated job generation
                </CardDescription>
              </div>
              <Button onClick={() => navigate("/settings/job-templates")}>
                Manage Templates
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Stripe Connect Section */}
        <StripeConnectSection />

        {/* Password Change Section */}
        <PasswordChangeSection />
      </div>
    </DashboardLayout>
  );
}

function StripeConnectSection() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch organization details for Stripe Connect status
  const { data: orgDetails, isLoading: orgLoading } = useQuery({
    queryKey: ["organization-stripe", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;
      const { data, error } = await supabase
        .from("organizations")
        .select("stripe_connect_account_id, payment_required_before_onboarding")
        .eq("id", organization.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const connectStripeMutation = useMutation({
    mutationFn: async () => {
      setIsConnecting(true);
      const { data, error } = await supabase.functions.invoke("stripe-connect-onboard", {
        body: {
          return_url: `${window.location.origin}/settings?stripe_connected=true`,
          refresh_url: `${window.location.origin}/settings?stripe_refresh=true`,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.onboarding_url) {
        window.location.href = data.onboarding_url;
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to connect Stripe: ${error.message}`);
      setIsConnecting(false);
    },
  });

  const togglePaymentRequiredMutation = useMutation({
    mutationFn: async (required: boolean) => {
      setIsUpdating(true);
      const { error } = await supabase
        .from("organizations")
        .update({ payment_required_before_onboarding: required })
        .eq("id", organization!.id);
      if (error) throw error;
      return required;
    },
    onSuccess: (required) => {
      toast.success(`Payment ${required ? "now required" : "no longer required"} before onboarding`);
      queryClient.invalidateQueries({ queryKey: ["organization-stripe"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update setting: ${error.message}`);
    },
    onSettled: () => {
      setIsUpdating(false);
    },
  });

  const isConnected = !!orgDetails?.stripe_connect_account_id;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Client Billing (Stripe Connect)
                {isConnected && (
                  <Badge variant="default" className="bg-green-600 ml-2">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Connect your Stripe account to collect payments from clients
              </CardDescription>
            </div>
          </div>
          {!isConnected && (
            <Button
              onClick={() => connectStripeMutation.mutate()}
              disabled={isConnecting || orgLoading}
            >
              {isConnecting ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Connect Stripe
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {orgLoading ? (
          <div className="text-sm text-muted-foreground py-4">Loading...</div>
        ) : !isConnected ? (
          <div className="text-center py-8 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No Stripe account connected</p>
            <p className="text-sm mt-1">
              Connect your Stripe account to collect payments from clients for quotes and invoices
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Connected Account Info */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Stripe Account</span>
                    <Badge variant="default" className="bg-green-600">Connected</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Account ID: {orgDetails.stripe_connect_account_id}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open("https://dashboard.stripe.com", "_blank")}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Stripe Dashboard
              </Button>
            </div>

            {/* Payment Settings */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Payment Settings</h4>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="payment-required">Require payment before onboarding</Label>
                  <p className="text-sm text-muted-foreground">
                    When enabled, clients must pay their first invoice before their application can be approved
                  </p>
                </div>
                <Switch
                  id="payment-required"
                  checked={orgDetails.payment_required_before_onboarding || false}
                  onCheckedChange={(checked) => togglePaymentRequiredMutation.mutate(checked)}
                  disabled={isUpdating}
                />
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg bg-muted p-4 text-sm">
          <p className="font-medium mb-2">How Stripe Connect works:</p>
          <ul className="space-y-1 text-muted-foreground list-disc list-inside">
            <li>Payments go directly to your Stripe account</li>
            <li>Clients can pay by card or Direct Debit</li>
            <li>Manage billing in your own Stripe Dashboard</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordChangeSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChanging, setIsChanging] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsChanging(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast.success("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Change Password
        </CardTitle>
        <CardDescription>
          Update your account password
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Enter new password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Confirm new password"
            />
          </div>

          <Button type="submit" disabled={isChanging || !newPassword || !confirmPassword}>
            {isChanging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update Password"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
