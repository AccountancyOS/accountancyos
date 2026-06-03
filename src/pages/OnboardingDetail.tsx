import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Check, X, Users, Building2, AlertTriangle, CreditCard, Mail, Send, ClipboardList } from "lucide-react";
import { emitOnboardingApproved, emitClientOnboarded } from "@/lib/automation-triggers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import OnboardingStatusStepper from "@/components/onboarding/OnboardingStatusStepper";
import EngagementLetterSection from "@/components/onboarding/EngagementLetterSection";
import { AMLVerificationPanel } from "@/components/onboarding/AMLVerificationPanel";
import OnboardingEventTimeline from "@/components/onboarding/OnboardingEventTimeline";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ApprovalResult {
  onboarding_id: string;
  status: string;
  client_id: string | null;
  company_id: string | null;
  engagement_ids: string[];
  portal_access: {
    portal_access_id?: string;
    invite_token?: string;
    email_queued?: boolean;
    error?: string;
    skipped?: boolean;
  };
  invitation_email_queued: boolean;
}

const OnboardingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [application, setApplication] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [engagementLetter, setEngagementLetter] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [services, setServices] = useState<Record<string, { name: string; billing_frequency: string | null }>>({});
  
  // Modal states
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showAmlWarningDialog, setShowAmlWarningDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showSendBackDialog, setShowSendBackDialog] = useState(false);
  const [sendBackStep, setSendBackStep] = useState<string>("engagement");
  const [sendBackReason, setSendBackReason] = useState("");
  const [sendingBack, setSendingBack] = useState(false);

  useEffect(() => {
    if (organization && id) {
      loadApplication();
      loadDocuments();
      loadEngagementLetter();
    }
  }, [organization, id]);

  const loadApplication = async () => {
    try {
      const { data, error } = await supabase
        .from("onboarding_applications")
        .select(`
          *,
          quote:quotes(quote_number, sent_at, accepted_at, accepted_snapshot, total_amount)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      setApplication(data);
      const snap = (data?.quote as any)?.accepted_snapshot ?? null;
      setSnapshot(snap);
      const serviceIds: string[] = Array.from(
        new Set(((snap?.lines ?? []) as any[])
          .map((l) => l?.service_id)
          .filter((x): x is string => !!x))
      );
      if (serviceIds.length > 0) {
        const { data: svc } = await supabase
          .from("services")
          .select("id,name,billing_frequency")
          .in("id", serviceIds);
        const map: Record<string, { name: string; billing_frequency: string | null }> = {};
        (svc ?? []).forEach((s: any) => {
          map[s.id] = { name: s.name, billing_frequency: s.billing_frequency ?? null };
        });
        setServices(map);
      } else {
        setServices({});
      }
    } catch (error: any) {
      toast({
        title: "Error loading application",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendBack = async () => {
    setSendingBack(true);
    try {
      const { error } = await supabase.rpc("lifecycle_send_back_onboarding" as any, {
        p_application_id: id,
        p_step: sendBackStep,
        p_reason: sendBackReason,
      });
      if (error) throw error;
      toast({ title: "Sent back to client", description: "The client has been notified by email." });
      setShowSendBackDialog(false);
      setSendBackReason("");
      loadApplication();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSendingBack(false);
    }
  };

  const loadDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from("onboarding_documents")
        .select("*")
        .eq("application_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      console.error("Error loading documents:", error);
    }
  };

  const loadEngagementLetter = async () => {
    try {
      const { data, error } = await supabase
        .from("engagement_letters")
        .select("*")
        .eq("onboarding_application_id", id)
        .maybeSingle();

      if (error) throw error;
      setEngagementLetter(data);
    } catch (error: any) {
      console.error("Error loading engagement letter:", error);
    }
  };

  // Reject application with reason
  const rejectApplication = async () => {
    setRejecting(true);
    try {
      const { error } = await supabase
        .from("onboarding_applications")
        .update({ 
          status: "rejected",
          notes: rejectionReason ? `Rejection reason: ${rejectionReason}` : null
        })
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Application rejected" });
      setShowRejectDialog(false);
      setRejectionReason("");
      loadApplication();
    } catch (error: any) {
      toast({
        title: "Error rejecting application",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRejecting(false);
    }
  };

  // Handle approval click - check for AML warning first
  const handleApproveClick = () => {
    const amlComplete = application.id_document_uploaded && application.proof_of_address_uploaded;
    
    if (!amlComplete) {
      setShowAmlWarningDialog(true);
    } else {
      approveApplication();
    }
  };

  // Use lifecycle_approve_onboarding RPC
  const approveApplication = async () => {
    setApproving(true);
    setShowAmlWarningDialog(false);
    try {
      const { data, error } = await supabase.rpc('lifecycle_approve_onboarding', {
        p_onboarding_id: id
      });

      if (error) throw error;

      const result = data as unknown as ApprovalResult;

      // Emit automation events for the onboarding approval
      if (organization?.id && id) {
        await emitOnboardingApproved(
          organization.id,
          id,
          result.client_id || undefined,
          result.company_id || undefined
        );
        
        // Also emit client_onboarded for the newly created client/company
        if (result.client_id) {
          await emitClientOnboarded(organization.id, result.client_id, 'client');
        }
        if (result.company_id) {
          await emitClientOnboarded(organization.id, result.company_id, 'company');
        }
      }

      toast({ 
        title: "Application approved successfully",
        description: result.client_id 
          ? "Client created and portal access granted"
          : result.company_id 
          ? "Company created and portal access granted"
          : "Application approved"
      });

      loadApplication();
    } catch (error: any) {
      toast({
        title: "Error approving application",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!application) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <p>Application not found</p>
        </div>
      </DashboardLayout>
    );
  }

  const recipientName = application.application_type === "individual"
    ? `${application.first_name} ${application.last_name}`
    : application.company_name;

  // Approval logic: engagement letter REQUIRED, AML warns but doesn't block
  const engagementSigned = !!engagementLetter?.signed_at;
  const amlComplete = application.id_document_uploaded && application.proof_of_address_uploaded;
  const canApprove = engagementSigned;

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-auto">
        <div className="p-8 max-w-5xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => navigate("/onboarding")}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Applications
          </Button>

          <div className="grid gap-6">
            {/* For Review banner */}
            {application.status === "for_review" && (
              <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800">
                <CardContent className="py-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <ClipboardList className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                        Ready for your review
                      </p>
                      <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                        The client has completed all onboarding steps
                        {application.submitted_for_review_at
                          ? ` on ${new Date(application.submitted_for_review_at).toLocaleString()}`
                          : ""}
                        . Verify the items below before marking complete.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setShowSendBackDialog(true)}>
                      <Send className="mr-2 h-4 w-4" />
                      Send Back
                    </Button>
                    <Button size="sm" onClick={handleApproveClick} disabled={!canApprove || approving}>
                      {approving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Approve & Activate
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {application.status === "needs_client_action" && application.review_feedback && (
              <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-800">
                <CardContent className="py-4">
                  <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                    Sent back to client
                  </p>
                  <p className="text-xs text-orange-800 dark:text-orange-200 mt-1">
                    {application.review_feedback}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Header Card */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {application.application_type === "individual" ? (
                      <Users className="h-6 w-6 text-muted-foreground" />
                    ) : (
                      <Building2 className="h-6 w-6 text-muted-foreground" />
                    )}
                    <div>
                      <CardTitle className="text-2xl">
                        {recipientName}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {application.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <Badge variant={application.status === "approved" ? "default" : application.status === "rejected" ? "destructive" : "secondary"}>
                      {application.status.replace(/_/g, " ").toUpperCase()}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={application.aml_status === "verified" ? "default" : "secondary"}
                      >
                        AML: {application.aml_status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Commercial Snapshot */}
            {snapshot && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Commercial Snapshot</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    From accepted quote {application.quote?.quote_number}
                    {application.quote?.accepted_at
                      ? ` on ${new Date(application.quote.accepted_at).toLocaleDateString()}`
                      : ""}
                  </div>
                  <div className="rounded-md border divide-y">
                    {(snapshot.lines || []).map((line: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div>
                          <div className="font-medium">{line.description || line.service_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {line.billing_frequency || "one-off"}
                            {line.quantity ? ` · qty ${line.quantity}` : ""}
                          </div>
                        </div>
                        <div className="font-mono">
                          £{Number(line.amount ?? line.unit_amount ?? 0).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-sm pt-2 border-t">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-semibold">
                      £{Number(snapshot.total ?? application.quote?.total_amount ?? 0).toFixed(2)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Billing & Portal status (visible once for review) */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> Billing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant={application.billing_status === "completed" ? "default" : "secondary"}>
                      {(application.billing_status || "not_started").replace(/_/g, " ")}
                    </Badge>
                  </div>
                  {application.billing_amount != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-mono">£{Number(application.billing_amount).toFixed(2)}</span>
                    </div>
                  )}
                  {application.stripe_checkout_session_id && (
                    <div className="text-xs text-muted-foreground break-all">
                      Session: {application.stripe_checkout_session_id}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Mail className="h-4 w-4" /> Portal
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Portal email</span>
                    <span className="font-medium">{application.portal_email || application.email || "—"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A portal account will be created when you mark this application complete.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Status Stepper */}
            <Card>
              <CardContent className="py-6">
                <OnboardingStatusStepper
                  quoteStatus={application.quote?.accepted_at ? "accepted" : "sent"}
                  quoteSentAt={application.quote?.sent_at}
                  quoteAcceptedAt={application.quote?.accepted_at}
                  engagementLetterStatus={engagementLetter?.signed_at ? "signed" : engagementLetter?.sent_at ? "sent" : undefined}
                  engagementLetterSignedAt={engagementLetter?.signed_at}
                  amlStatus={application.aml_status}
                  amlVerifiedAt={application.aml_verified_at}
                  applicationStatus={application.status}
                  approvedAt={application.approved_at}
                />
              </CardContent>
            </Card>

            {/* Onboarding Questionnaire */}
            <OnboardingQuestionnaireSection
              onboardingId={id!}
              organizationId={organization!.id}
              questionnaireInstanceId={application.onboarding_questionnaire_instance_id}
              questionnaireSubmittedAt={application.questionnaire_submitted_at}
              recipientEmail={application.email}
              recipientName={recipientName}
              onQuestionnaireSent={loadApplication}
            />

            <div className="grid gap-6 md:grid-cols-2">
              {/* Engagement Letter */}
              <EngagementLetterSection
                applicationId={id!}
                organizationId={organization!.id}
                recipientEmail={application.email}
                recipientName={recipientName}
                onLetterStatusChange={loadEngagementLetter}
              />

              {/* AML Verification */}
              <AMLVerificationPanel
                onboardingId={id!}
                amlStatus={application.aml_status}
                amlVerifiedAt={application.aml_verified_at}
                amlExpiryDate={application.aml_expiry_date}
                idDocumentUploaded={application.id_document_uploaded}
                proofOfAddressUploaded={application.proof_of_address_uploaded}
                clientInfo={{
                  firstName: application.first_name,
                  lastName: application.last_name,
                  companyName: application.company_name,
                  dateOfBirth: application.date_of_birth,
                  addressLine1: application.address_line_1,
                  addressLine2: application.address_line_2,
                  city: application.city,
                  postcode: application.postcode,
                  country: application.country,
                }}
                documents={documents.map(d => ({
                  id: d.id,
                  name: d.file_name,
                  type: d.document_type,
                  storagePath: d.file_path,
                }))}
                onVerified={loadApplication}
              />
            </div>

            {/* Professional Clearance */}
            <ProfessionalClearanceSection
              onboardingId={id!}
              previousAccountantRequired={application.previous_accountant_required || false}
              previousAccountantFirmName={application.previous_accountant_firm_name}
              previousAccountantEmail={application.previous_accountant_email}
              clearanceReceived={application.clearance_received || false}
              clearanceReceivedAt={application.clearance_received_at}
              clearanceNotes={application.clearance_notes}
              onUpdate={loadApplication}
            />

            <div className="grid gap-6 md:grid-cols-2">
              {/* Application Status Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Approval Requirements</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {/* Engagement Letter - Required */}
                    <div className="flex items-center justify-between p-3 rounded-md border">
                      <span className="text-sm font-medium">Engagement Letter Signed</span>
                      {engagementSigned ? (
                        <Badge variant="default" className="bg-green-600">
                          <Check className="h-3 w-3 mr-1" />
                          Complete
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <X className="h-3 w-3 mr-1" />
                          Required
                        </Badge>
                      )}
                    </div>

                    {/* AML Documents - Recommended */}
                    <div className="flex items-center justify-between p-3 rounded-md border">
                      <span className="text-sm font-medium">AML Documents</span>
                      {amlComplete ? (
                        <Badge variant="default" className="bg-green-600">
                          <Check className="h-3 w-3 mr-1" />
                          Complete
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Recommended
                        </Badge>
                      )}
                    </div>
                  </div>

                  {!engagementSigned && (
                    <p className="text-xs text-muted-foreground">
                      The engagement letter must be signed before you can approve this application.
                    </p>
                  )}

                  {engagementSigned && !amlComplete && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      AML documents are incomplete. You can still approve, but it's recommended to collect them first.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Documents */}
            <Card>
              <CardHeader>
                <CardTitle>AML Documents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>ID Document</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept=".pdf,.jpg,.png"
                        onChange={(e) => handleFileUpload(e, "id_document")}
                        disabled={uploading}
                      />
                      {application.id_document_uploaded && (
                        <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Proof of Address</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept=".pdf,.jpg,.png"
                        onChange={(e) => handleFileUpload(e, "proof_of_address")}
                        disabled={uploading}
                      />
                      {application.proof_of_address_uploaded && (
                        <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Additional Documents</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept=".pdf,.jpg,.png"
                        onChange={(e) => handleFileUpload(e, "other")}
                        disabled={uploading}
                      />
                      {application.additional_documents_uploaded && (
                        <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                </div>

                {documents.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <Label>Uploaded Files</Label>
                    <div className="space-y-1">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <FileText className="h-4 w-4" />
                          {doc.file_name}
                          <Badge variant="outline" className="text-xs">
                            {doc.document_type.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            {application.status !== "approved" && application.status !== "rejected" && (
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      {!canApprove && (
                        <p className="text-sm text-muted-foreground">
                          Engagement letter must be signed before approval
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setShowRejectDialog(true)}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        onClick={handleApproveClick}
                        disabled={!canApprove || approving}
                      >
                        {approving ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-2 h-4 w-4" />
                        )}
                        Approve & Create Client
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Success State */}
            {application.status === "approved" && (
              <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-green-900 dark:text-green-100">
                        ✓ Application approved and {application.application_type === "individual" ? "client" : "company"} created
                      </p>
                      {application.approved_at && (
                        <p className="text-xs text-green-800 dark:text-green-200">
                          Approved on {new Date(application.approved_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (application.client_id) {
                          navigate(`/clients/${application.client_id}`);
                        } else if (application.company_id) {
                          navigate(`/clients/company/${application.company_id}`);
                        }
                      }}
                    >
                      View {application.application_type === "individual" ? "Client" : "Company"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Rejected State */}
            {application.status === "rejected" && (
              <Card className="border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
                <CardContent className="py-4">
                  <p className="text-sm font-medium text-red-900 dark:text-red-100">
                    ✗ Application rejected
                  </p>
                  {application.notes && (
                    <p className="text-xs text-red-800 dark:text-red-200 mt-1">
                      {application.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Audit Timeline */}
            <OnboardingEventTimeline applicationId={application.id} />
          </div>
        </div>
      </div>

      {/* Rejection Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Application</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject this application for {recipientName}? This action can be undone by creating a new application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="rejection-reason">Reason (optional)</Label>
            <Textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter reason for rejection..."
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={rejectApplication}
              disabled={rejecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {rejecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Reject Application
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AML Warning Dialog */}
      <AlertDialog open={showAmlWarningDialog} onOpenChange={setShowAmlWarningDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              AML Documents Incomplete
            </AlertDialogTitle>
            <AlertDialogDescription>
              The following AML documents have not been uploaded:
              <ul className="list-disc list-inside mt-2 space-y-1">
                {!application.id_document_uploaded && <li>ID Document</li>}
                {!application.proof_of_address_uploaded && <li>Proof of Address</li>}
              </ul>
              <p className="mt-3">
                You can still approve this application, but it's recommended to collect AML documents before proceeding.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={approveApplication}
              disabled={approving}
            >
              {approving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Continue Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Back Dialog */}
      <AlertDialog open={showSendBackDialog} onOpenChange={setShowSendBackDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send back to client</AlertDialogTitle>
            <AlertDialogDescription>
              Choose the step the client should revisit and add a short note. They will receive an email with a link to resume.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <Label>Step to revisit</Label>
              <Select value={sendBackStep} onValueChange={setSendBackStep}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="engagement">Engagement letter</SelectItem>
                  <SelectItem value="aml">AML documents</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="portal">Portal details</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="send-back-reason">Feedback for the client</Label>
              <Textarea
                id="send-back-reason"
                className="mt-2"
                value={sendBackReason}
                onChange={(e) => setSendBackReason(e.target.value)}
                placeholder="e.g. proof of address is older than 3 months — please re-upload"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendBack} disabled={sendingBack}>
              {sendingBack ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default OnboardingDetail;
