import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FileCheck, Send, CheckCircle, FileText, Download, RefreshCw, Clock, XCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { sendFilingForApproval, markFilingAsFiled, generateFilingDocuments, getDocumentTypesForFiling } from "@/lib/filing-service";

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
      if (!filing) throw new Error("No filing");
      return sendFilingForApproval(
        filing.id,
        filing.client_id,
        filing.company_id,
        filing.organization_id,
        filing.job_id
      );
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["job-filing", jobId] });
        toast({ title: "Filing sent for client approval" });
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
    },
  });

  const markAsFiledMutation = useMutation({
    mutationFn: async () => {
      if (!filing) throw new Error("No filing");
      const { data: { user } } = await supabase.auth.getUser();
      const result = await markFilingAsFiled(filing.id, user?.id || "unknown");
      if (!result.success) throw new Error(result.error);
      
      // Mark job as complete
      await supabase
        .from("jobs")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", jobId);
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-filing", jobId] });
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      toast({ title: "Filing marked as filed. Job complete!" });
    },
  });

  const generateDocsMutation = useMutation({
    mutationFn: async () => {
      if (!filing) throw new Error("No filing");
      return generateFilingDocuments(filing.id, filing.filing_type);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["job-filing", jobId] });
        toast({ title: "Documents generated" });
      }
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

  const documents = (filing.generated_documents as any[]) || [];
  const canSendForApproval = ["draft", "in_progress", "rejected"].includes(filing.status);
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
          {filing.status.replace(/_/g, " ")}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tax Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Tax Summary</CardTitle>
            <CardDescription>Tax year {filing.tax_year}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium">Tax Due</p>
                <p className="text-2xl font-bold">
                  £{(filing.tax_due || 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Tax Refund</p>
                <p className="text-2xl font-bold text-green-600">
                  £{(filing.tax_refund || 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            {filing.payment_deadline && (
              <div className="pt-2 border-t">
                <p className="text-sm font-medium">Payment Deadline</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(filing.payment_deadline), "d MMMM yyyy")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Documents</CardTitle>
            {!isFiled && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => generateDocsMutation.mutate()}
                disabled={generateDocsMutation.isPending}
              >
                {generateDocsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground">
                <p>No documents yet</p>
                <p className="text-xs mt-1">Expected: {getDocumentTypesForFiling(filing.filing_type).slice(0, 2).join(", ")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.slice(0, 3).map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{doc.name}</span>
                    <Button variant="ghost" size="sm">
                      <Download className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {documents.length > 3 && (
                  <p className="text-xs text-muted-foreground">+{documents.length - 3} more</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
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
              {sendForApprovalMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send for Client Approval
            </Button>
          )}

          {canFile && (
            <Button
              className="w-full justify-start"
              onClick={() => markAsFiledMutation.mutate()}
              disabled={markAsFiledMutation.isPending}
            >
              {markAsFiledMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Mark as Filed
            </Button>
          )}

          {isFiled && filing.filed_at && (
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
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

      {/* Status Notices */}
      {filing.status === "awaiting_approval" && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="py-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="text-sm font-medium text-yellow-700">Awaiting Client Approval</p>
              <p className="text-xs text-muted-foreground">
                Sent {filing.approval_requested_at && format(new Date(filing.approval_requested_at), "d MMM yyyy")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {filing.status === "rejected" && filing.rejection_reason && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-4 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Rejected by Client</p>
              <p className="text-sm text-muted-foreground mt-1">{filing.rejection_reason}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
