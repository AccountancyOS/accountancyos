import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Mail, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Settings() {
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

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
    refetchInterval: 10000, // Refresh every 10 seconds
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

  // Manual process queue mutation
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Manage system settings and email queue
          </p>
        </div>

        <Separator />

        {/* Email Queue Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Queue
                </CardTitle>
                <CardDescription>
                  Automated email processing via cron job (runs every 1 minute)
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
                <li>Lifecycle RPCs queue emails automatically</li>
                <li>Cron job processes queue every 1 minute</li>
                <li>Emails sent via Postmark</li>
                <li>Manual "Process Now" button for testing/emergencies</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
