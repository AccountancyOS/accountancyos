import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SADraftScheduleData, PartnershipDraftScheduleData, AccountsDraftScheduleData } from "@/types/filing-schemas";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  FileText, 
  Send, 
  CheckCircle, 
  XCircle, 
  Download,
  Clock,
  AlertTriangle,
  FileCheck,
  Loader2,
  RefreshCw,
  Mail,
  Lock,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import { formatStatus } from "@/lib/format-utils";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import {
  sendFilingForApproval,
  markFilingAsFiled,
  generateFilingDocuments,
  getDocumentTypesForFiling,
  updateFilingStatus,
} from "@/lib/filing-service";
import { approveCt600Filing, revokeCt600Approval, hasActiveCt600Approval } from "@/lib/ct600-filing-approval";
import { ComposeEmailDialog } from "@/components/email/ComposeEmailDialog";
import { FilingUnlockDialog } from "@/components/filings/FilingUnlockDialog";
import { FilingVersionHistory } from "@/components/filings/FilingVersionHistory";
import { SendToClientDialog } from "@/components/filings/SendToClientDialog";
import { SATaxReturnEditor } from "@/components/filings/sa/SATaxReturnEditor";
import { PartnershipScheduleEditor } from "@/components/filings/partnership/PartnershipScheduleEditor";
import { PartnerShareBanner } from "@/components/filings/partnership/PartnerShareBanner";
import { FRS105AccountsEditor } from "@/components/filings/accounts/FRS105AccountsEditor";

export default function FilingDetail() {
  const { filingId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filingReference, setFilingReference] = useState("");
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  const { data: filing, isLoading } = useQuery({
    queryKey: ["filing", filingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("filings")
        .select(`
          *,
          clients(first_name, last_name, email),
          companies(company_name, email),
          jobs!filings_job_id_fkey(job_name, service_type, is_auto_generated, source_job_id)
        `)
        .eq("id", filingId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!filingId,
  });

  const { data: filingDocuments } = useQuery({
    queryKey: ["filing-documents", filingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("filing_documents")
        .select("*")
        .eq("filing_id", filingId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!filingId,
  });

  const invalidateFiling = () => {
    queryClient.invalidateQueries({ queryKey: ["filing", filingId] });
    queryClient.invalidateQueries({ queryKey: ["filing-versions", filingId] });
  };

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
        invalidateFiling();
        toast({ title: "Filing sent for client approval" });
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
    },
  });

  // Stage B (CT600): accountant approval of an immutable CT600 snapshot.
  const isCt600 = !!filing && ['CT600', 'ct600', 'corporation_tax'].includes(filing.filing_type);
  const { data: ct600Approved } = useQuery({
    queryKey: ["ct600-approval", filing?.id],
    queryFn: () => hasActiveCt600Approval(filing!.id),
    enabled: !!isCt600 && !!filing?.id,
  });
  const approveCt600Mutation = useMutation({
    mutationFn: async () => {
      if (!filing) throw new Error("No filing");
      const res = await approveCt600Filing(filing.id);
      if (!res.success) throw new Error(res.error || "Could not approve for filing");
    },
    onSuccess: () => {
      invalidateFiling();
      queryClient.invalidateQueries({ queryKey: ["ct600-approval", filing?.id] });
      toast({ title: "CT600 approved for filing (snapshot locked)" });
    },
    onError: (e) => toast({ title: "Error", description: e instanceof Error ? e.message : "Could not approve", variant: "destructive" }),
  });
  const revokeCt600Mutation = useMutation({
    mutationFn: async () => {
      if (!filing) throw new Error("No filing");
      const res = await revokeCt600Approval(filing.id);
      if (!res.success) throw new Error(res.error || "Could not clear approval");
    },
    onSuccess: () => {
      invalidateFiling();
      queryClient.invalidateQueries({ queryKey: ["ct600-approval", filing?.id] });
      toast({ title: "CT600 approval cleared" });
    },
    onError: (e) => toast({ title: "Error", description: e instanceof Error ? e.message : "Could not clear", variant: "destructive" }),
  });

  const generateDocsMutation = useMutation({
    mutationFn: async () => {
      if (!filing) throw new Error("No filing");
      return generateFilingDocuments(filing.id, filing.filing_type);
    },
    onSuccess: (result) => {
      if (result.success) {
        invalidateFiling();
        toast({ title: "Documents generated successfully" });
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
    },
  });

  const markAsFiledMutation = useMutation({
    mutationFn: async () => {
      if (!filing) throw new Error("No filing");
      const { data: { user } } = await supabase.auth.getUser();
      return markFilingAsFiled(filing.id, user?.id || "unknown", filingReference || undefined);
    },
    onSuccess: async (result) => {
      if (result.success) {
        if (filing?.job_id) {
          await supabase
            .from("jobs")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", filing.job_id);
        }
        invalidateFiling();
        queryClient.invalidateQueries({ queryKey: ["job", filing?.job_id] });
        toast({ title: "Filing marked as filed. Job complete." });
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async () => {
      if (!filing) throw new Error("No filing");
      return updateFilingStatus(filing.id, "in_progress", { is_locked: false });
    },
    onSuccess: (result) => {
      if (result.success) {
        invalidateFiling();
        toast({ title: "Filing reopened for editing" });
      }
    },
  });

  const markReadyMutation = useMutation({
    mutationFn: async () => {
      if (!filing) throw new Error("No filing");
      return updateFilingStatus(filing.id, "ready_for_review");
    },
    onSuccess: (result) => {
      if (result.success) {
        invalidateFiling();
        toast({ title: "Filing marked as ready for review" });
      }
    },
  });

  const getStatusBadge = (status: string) => {
    const config: Record<string, { color: string; icon: React.ReactNode }> = {
      draft: { color: "bg-muted text-muted-foreground", icon: <FileText className="h-3 w-3" /> },
      not_started: { color: "bg-muted text-muted-foreground", icon: <Clock className="h-3 w-3" /> },
      in_progress: { color: "bg-blue-500 text-white", icon: <RefreshCw className="h-3 w-3" /> },
      ready_for_review: { color: "bg-indigo-500 text-white", icon: <Eye className="h-3 w-3" /> },
      sent_to_client: { color: "bg-orange-500 text-white", icon: <Send className="h-3 w-3" /> },
      client_changes_requested: { color: "bg-yellow-500 text-white", icon: <AlertTriangle className="h-3 w-3" /> },
      awaiting_approval: { color: "bg-yellow-500 text-white", icon: <Clock className="h-3 w-3" /> },
      approved: { color: "bg-emerald-500 text-white", icon: <CheckCircle className="h-3 w-3" /> },
      ready_to_file: { color: "bg-emerald-500 text-white", icon: <FileCheck className="h-3 w-3" /> },
      submitted: { color: "bg-blue-600 text-white", icon: <Send className="h-3 w-3" /> },
      accepted: { color: "bg-green-600 text-white", icon: <CheckCircle className="h-3 w-3" /> },
      filed: { color: "bg-green-600 text-white", icon: <CheckCircle className="h-3 w-3" /> },
      rejected: { color: "bg-destructive text-destructive-foreground", icon: <XCircle className="h-3 w-3" /> },
    };
    const { color, icon } = config[status] || config.draft;
    return (
      <Badge className={`${color} flex items-center gap-1`}>
        {icon}
        {formatStatus(status)}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!filing) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Filing not found</p>
          <Button variant="outline" onClick={() => navigate("/filings")} className="mt-4">
            Back to Filings
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const entityName = filing.companies?.company_name || 
    (filing.clients ? `${filing.clients.first_name} ${filing.clients.last_name}` : "Unknown");
  
  const documents = filingDocuments || [];
  const filingAny = filing as any;
  
  // Status-based action visibility
  const canMarkReady = ["draft", "in_progress"].includes(filing.status);
  const canSendToClient = ["draft", "in_progress", "ready_for_review", "client_changes_requested"].includes(filing.status);
  const canSendForApproval = ["sent_to_client", "ready_for_review", "rejected"].includes(filing.status);
  const canMarkAsFiled = ["approved", "ready_to_file"].includes(filing.status);
  const canReopen = filing.status === "rejected" && !filing.is_locked;
  const canUnlock = !!filing.is_locked && !["filed", "accepted", "submitted"].includes(filing.status);
  const isFiled = filing.status === "filed" || filing.status === "accepted";
  const jobData = filing.jobs as any;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{filing.filing_type} Filing</h1>
              {getStatusBadge(filing.status)}
              {filing.is_locked && (
                <Badge variant="outline" className="text-muted-foreground">
                  <Lock className="h-3 w-3 mr-1" />
                  Locked
                </Badge>
              )}
              {filingAny.current_version > 0 && (
                <Badge variant="secondary">v{filingAny.current_version}</Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {entityName} • {filing.tax_year || `${filing.period_start} - ${filing.period_end}`}
            </p>
          </div>
          <Button variant="outline" onClick={() => setIsComposeOpen(true)}>
            <Mail className="h-4 w-4 mr-2" />
            Email Client
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tax Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Tax Summary</CardTitle>
                <CardDescription>Calculated from workpaper</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Tax Due</p>
                    <p className="text-3xl font-bold">
                      £{(filing.tax_due || 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tax Refund</p>
                    <p className="text-3xl font-bold text-green-600">
                      £{(filing.tax_refund || 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                {filing.payment_deadline && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">Payment Deadline</p>
                    <p className="font-medium">{format(new Date(filing.payment_deadline), "d MMMM yyyy")}</p>
                  </div>
                )}
                {filing.second_payment_date && (
                  <div className="mt-2">
                    <p className="text-sm text-muted-foreground">Second Payment Date</p>
                    <p className="font-medium">{format(new Date(filing.second_payment_date), "d MMMM yyyy")}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Partner Share Banner (reference-based) */}
            {filingAny.partnership_allocation_id && (
              <PartnerShareBanner filingId={filing.id} />
            )}

            {/* SA Schedule Editor */}
            {(filing.filing_type === 'self_assessment' || filing.filing_type === 'SA100' || filing.filing_type === 'SA_NON_MTD') && !isFiled && (
              <SATaxReturnEditor
                draft={(filingAny.draft_schedule_data_json || {}) as SADraftScheduleData}
                onSave={async (data) => {
                  await supabase
                    .from('filings')
                    .update({ draft_schedule_data_json: data as any })
                    .eq('id', filing.id);
                  invalidateFiling();
                }}
                readonly={!!filing.is_locked}
              />
            )}

            {/* Partnership Schedule Editor */}
            {filing.filing_type === 'PARTNERSHIP' && !isFiled && (
              <PartnershipScheduleEditor
                draft={(filingAny.draft_schedule_data_json || {
                  partnership: { partnership_name: '', utr: '', period_start: '', period_end: '' },
                  turnover: 0, total_expenses: 0, net_profit: 0,
                  disallowable_expenses: 0, capital_allowances: 0, adjusted_profit: 0,
                  allocations: [],
                }) as PartnershipDraftScheduleData}
                onSave={async (data) => {
                  await supabase
                    .from('filings')
                    .update({ draft_schedule_data_json: data as any })
                    .eq('id', filing.id);
                  invalidateFiling();
                }}
                readonly={!!filing.is_locked}
              />
            )}

            {/* FRS105 Accounts Editor */}
            {(filing.filing_type === 'ACCOUNTS_FRS105' || filing.filing_type === 'accounts_frs105') && !isFiled && (
              <FRS105AccountsEditor
                draft={(filingAny.draft_schedule_data_json || {}) as AccountsDraftScheduleData}
                onSave={async (data) => {
                  await supabase
                    .from('filings')
                    .update({ draft_schedule_data_json: data as any })
                    .eq('id', filing.id);
                  invalidateFiling();
                }}
                readonly={!!filing.is_locked}
                filingId={filing.id}
                organizationId={filing.organization_id}
              />
            )}

            {isCt600 && !isFiled && (
              <Card>
                <CardHeader>
                  <CardTitle>CT600 filing approval</CardTitle>
                  <CardDescription>
                    {ct600Approved
                      ? "Approved — an immutable snapshot of the corporation-tax computation is locked for submission."
                      : "Approve to lock an immutable snapshot of the corporation-tax computation before it can be submitted."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {ct600Approved ? (
                    <Button
                      variant="outline"
                      onClick={() => revokeCt600Mutation.mutate()}
                      disabled={revokeCt600Mutation.isPending}
                    >
                      Clear approval
                    </Button>
                  ) : (
                    <Button
                      onClick={() => approveCt600Mutation.mutate()}
                      disabled={approveCt600Mutation.isPending}
                    >
                      Approve for filing
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Filing Documents</CardTitle>
                  <CardDescription>
                    {documents.length > 0
                      ? `${documents.length} document(s) generated`
                      : "No documents generated yet"}
                  </CardDescription>
                </div>
                {!isFiled && (
                  <Button 
                    variant="outline" 
                    onClick={() => generateDocsMutation.mutate()}
                    disabled={generateDocsMutation.isPending}
                  >
                    {generateDocsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Generate Documents
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Click "Generate Documents" to create filing documents</p>
                    <p className="text-sm mt-1">
                      Expected: {getDocumentTypesForFiling(filing.filing_type).join(", ")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc: any) => (
                      <div 
                        key={doc.id} 
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{doc.document_type || doc.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Generated {doc.created_at ? format(new Date(doc.created_at), "d MMM yyyy HH:mm") : "Unknown"}
                            </p>
                          </div>
                        </div>
                        {doc.file_url ? (
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
                          </a>
                        ) : (
                          <Button variant="ghost" size="sm" disabled>
                            <Download className="h-4 w-4 opacity-50" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {jobData?.is_auto_generated && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center gap-2 text-sm">
                      <RefreshCw className="h-4 w-4 text-primary" />
                      <span className="text-muted-foreground">Auto-generated from rollover</span>
                      {jobData.source_job_id && (
                        <Button 
                          variant="link" 
                          size="sm" 
                          className="p-0 h-auto"
                          onClick={() => navigate(`/jobs/${jobData.source_job_id}`)}
                        >
                          View source job
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Rejection Notice */}
            {(filing.status === "rejected" || filing.status === "client_changes_requested") && filing.rejection_reason && (
              <Card className="border-destructive">
                <CardHeader>
                  <CardTitle className="text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    {filing.status === "client_changes_requested" ? "Client Requested Changes" : "Client Rejected Filing"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{filing.rejection_reason}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {canMarkReady && (
                  <Button 
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => markReadyMutation.mutate()}
                    disabled={markReadyMutation.isPending}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Mark Ready for Review
                  </Button>
                )}

                {canSendToClient && (
                  <SendToClientDialog
                    filingId={filing.id}
                    entityName={entityName}
                    onSent={invalidateFiling}
                    trigger={
                      <Button className="w-full justify-start">
                        <Send className="h-4 w-4 mr-2" />
                        Send to Client
                      </Button>
                    }
                  />
                )}

                {canSendForApproval && (
                  <Button 
                    className="w-full justify-start" 
                    onClick={() => sendForApprovalMutation.mutate()}
                    disabled={sendForApprovalMutation.isPending}
                  >
                    {sendForApprovalMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send for Client Approval
                  </Button>
                )}

                {canMarkAsFiled && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button className="w-full justify-start">
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Mark as Filed
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Mark Filing as Filed?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will lock the filing and mark the associated job as complete.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="py-4">
                        <Label htmlFor="reference">Filing Reference (optional)</Label>
                        <Input
                          id="reference"
                          placeholder="e.g., HMRC reference number"
                          value={filingReference}
                          onChange={(e) => setFilingReference(e.target.value)}
                          className="mt-2"
                        />
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => markAsFiledMutation.mutate()}
                          disabled={markAsFiledMutation.isPending}
                        >
                          {markAsFiledMutation.isPending ? "Filing..." : "Confirm Filed"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {canReopen && (
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => reopenMutation.mutate()}
                    disabled={reopenMutation.isPending}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reopen for Editing
                  </Button>
                )}

                {canUnlock && (
                  <FilingUnlockDialog
                    filingId={filing.id}
                    onUnlocked={invalidateFiling}
                    trigger={
                      <Button variant="outline" className="w-full justify-start text-destructive">
                        <Lock className="h-4 w-4 mr-2" />
                        Unlock Filing
                      </Button>
                    }
                  />
                )}

                {filing.job_id && (
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => navigate(`/jobs/${filing.job_id}`)}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    View Job
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Version History */}
            <FilingVersionHistory
              filingId={filing.id}
              currentSnapshotId={filingAny.current_snapshot_id}
            />

            {/* Audit Trail */}
            <Card>
              <CardHeader>
                <CardTitle>Audit Trail</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p>{format(new Date(filing.created_at!), "d MMM yyyy HH:mm")}</p>
                </div>
                {filing.approval_requested_at && (
                  <div>
                    <p className="text-muted-foreground">Sent for Approval</p>
                    <p>{format(new Date(filing.approval_requested_at), "d MMM yyyy HH:mm")}</p>
                  </div>
                )}
                {filing.approved_at && (
                  <div>
                    <p className="text-muted-foreground">Approved</p>
                    <p>{format(new Date(filing.approved_at), "d MMM yyyy HH:mm")}</p>
                    {filing.approved_by && (
                      <p className="text-xs text-muted-foreground">by {filing.approved_by}</p>
                    )}
                  </div>
                )}
                {filingAny.locked_at && (
                  <div>
                    <p className="text-muted-foreground">Locked</p>
                    <p>{format(new Date(filingAny.locked_at), "d MMM yyyy HH:mm")}</p>
                  </div>
                )}
                {filing.filed_at && (
                  <div>
                    <p className="text-muted-foreground">Filed</p>
                    <p>{format(new Date(filing.filed_at), "d MMM yyyy HH:mm")}</p>
                    {filing.filing_reference && (
                      <p className="text-xs">Ref: {filing.filing_reference}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Filing Details */}
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Filing Type</p>
                  <p className="font-medium">{filing.filing_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Filing Body</p>
                  <p className="font-medium">{filing.filing_body}</p>
                </div>
                {filing.tax_year && (
                  <div>
                    <p className="text-muted-foreground">Tax Year</p>
                    <p className="font-medium">{filing.tax_year}</p>
                  </div>
                )}
                {filing.period_start && filing.period_end && (
                  <div>
                    <p className="text-muted-foreground">Period</p>
                    <p className="font-medium">
                      {format(new Date(filing.period_start), "d MMM yyyy")} - {format(new Date(filing.period_end), "d MMM yyyy")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Compose Email Dialog */}
        <ComposeEmailDialog
          open={isComposeOpen}
          onOpenChange={setIsComposeOpen}
          filingId={filing?.id}
          clientId={filing?.client_id || undefined}
          companyId={filing?.company_id || undefined}
          defaultTo={filing?.clients?.email || filing?.companies?.email}
          defaultToName={entityName}
        />
      </div>
    </DashboardLayout>
  );
}
