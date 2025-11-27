import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FileCheck, Send, CheckCircle, FileText } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface JobFilingTabProps {
  jobId: string;
}

export function JobFilingTab({ jobId }: JobFilingTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: filing, isLoading } = useQuery({
    queryKey: ["job-filing", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("filings")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const sendForApprovalMutation = useMutation({
    mutationFn: async () => {
      if (!filing) return;

      const { error } = await supabase
        .from("filings")
        .update({
          status: "awaiting_approval",
          approval_requested_at: new Date().toISOString(),
        })
        .eq("id", filing.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-filing", jobId] });
      toast({ title: "Filing sent for client approval" });
    },
  });

  const markAsFiledMutation = useMutation({
    mutationFn: async () => {
      if (!filing) return;

      const { error } = await supabase
        .from("filings")
        .update({
          status: "filed",
          filed_at: new Date().toISOString(),
          is_locked: true,
        })
        .eq("id", filing.id);

      if (error) throw error;

      // Mark job as complete
      const { error: jobError } = await supabase
        .from("jobs")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", jobId);

      if (jobError) throw jobError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-filing", jobId] });
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      toast({ title: "Filing marked as filed. Job complete!" });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "filed":
        return "bg-green-500";
      case "approved":
      case "ready_to_file":
        return "bg-blue-500";
      case "awaiting_approval":
        return "bg-yellow-500";
      case "rejected":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading filing...</div>;
  }

  if (!filing) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <FileCheck className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Filing will be created automatically when workpaper is finalised
          </p>
        </CardContent>
      </Card>
    );
  }

  const canSendForApproval = filing.status === "draft";
  const canFile = filing.status === "approved" || filing.status === "ready_to_file";
  const isFiled = filing.status === "filed";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{filing.filing_type} Filing</h3>
          <p className="text-sm text-muted-foreground">
            {filing.tax_year} • Created {format(new Date(filing.created_at), "d MMM yyyy")}
          </p>
        </div>
        <Badge className={getStatusColor(filing.status)}>
          {filing.status}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filing Summary</CardTitle>
          <CardDescription>Tax year {filing.tax_year}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium">Tax Due</p>
              <p className="text-2xl font-bold">
                {filing.tax_due ? `£${filing.tax_due.toLocaleString()}` : "£0.00"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Tax Refund</p>
              <p className="text-2xl font-bold text-green-600">
                {filing.tax_refund ? `£${filing.tax_refund.toLocaleString()}` : "£0.00"}
              </p>
            </div>
          </div>

          {filing.payment_deadline && (
            <div>
              <p className="text-sm font-medium">Payment Deadline</p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(filing.payment_deadline), "d MMMM yyyy")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full justify-start"
            variant="outline"
            onClick={() => navigate(`/filings/${filing.id}`)}
          >
            <FileText className="mr-2 h-4 w-4" />
            View Full Filing Details
          </Button>

          {canSendForApproval && (
            <Button
              className="w-full justify-start"
              onClick={() => sendForApprovalMutation.mutate()}
              disabled={sendForApprovalMutation.isPending}
            >
              <Send className="mr-2 h-4 w-4" />
              Send for Client Approval
            </Button>
          )}

          {canFile && (
            <Button
              className="w-full justify-start"
              onClick={() => markAsFiledMutation.mutate()}
              disabled={markAsFiledMutation.isPending}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Mark as Filed
            </Button>
          )}

          {isFiled && filing.filed_at && (
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Filed on {format(new Date(filing.filed_at), "d MMMM yyyy HH:mm")}
              </p>
              {filing.filing_reference && (
                <p className="text-sm text-muted-foreground mt-1">
                  Reference: {filing.filing_reference}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {filing.status === "awaiting_approval" && (
        <Card className="border-yellow-500">
          <CardContent className="py-4">
            <p className="text-sm text-yellow-600">
              Awaiting client approval. Sent on{" "}
              {filing.approval_requested_at &&
                format(new Date(filing.approval_requested_at), "d MMM yyyy")}
            </p>
          </CardContent>
        </Card>
      )}

      {filing.status === "rejected" && filing.rejection_reason && (
        <Card className="border-red-500">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-red-600">Rejected by client</p>
            <p className="text-sm text-muted-foreground mt-2">{filing.rejection_reason}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
