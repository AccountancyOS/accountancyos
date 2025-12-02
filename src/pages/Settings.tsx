import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Mail, RefreshCw, CheckCircle2, XCircle, Clock, Plus, Trash2, MailCheck, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  // Handle URL params for Gmail callback success/error
  useEffect(() => {
    const gmailConnected = searchParams.get("gmail_connected");
    const error = searchParams.get("error");

    if (gmailConnected === "true") {
      toast.success("Gmail account connected successfully!");
      queryClient.invalidateQueries({ queryKey: ["connected-mailboxes"] });
      setSearchParams({});
    } else if (error) {
      const errorMessages: Record<string, string> = {
        invalid_state: "Invalid or expired session. Please try again.",
        token_exchange_failed: "Failed to connect to Gmail. Please try again.",
        profile_fetch_failed: "Failed to fetch Gmail profile.",
        no_email: "Could not retrieve email address from Gmail.",
        update_failed: "Failed to update existing connection.",
        create_failed: "Failed to create mailbox connection.",
        internal_error: "An unexpected error occurred.",
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
        .from("connected_mailboxes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

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

  // Sync mailbox mutation
  const syncMailboxMutation = useMutation({
    mutationFn: async (mailboxId: string) => {
      setIsSyncing(mailboxId);
      const { data, error } = await supabase.functions.invoke("gmail-sync", {
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
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Manage email integrations and system settings
          </p>
        </div>

        <Separator />

        {/* Connected Email Accounts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MailCheck className="h-5 w-5" />
                  Connected Email Accounts
                </CardTitle>
                <CardDescription>
                  Connect your Gmail or Outlook to send and receive emails directly from AccountancyOS
                </CardDescription>
              </div>
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
                        onClick={() => syncMailboxMutation.mutate(mailbox.id)}
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
                <h4 className="text-sm font-semibold">Recent Failures</h4>
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
      </div>
    </DashboardLayout>
  );
}
