import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Check, X, FileText, ExternalLink, Users, Building2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import OnboardingStatusStepper from "@/components/onboarding/OnboardingStatusStepper";
import EngagementLetterSection from "@/components/onboarding/EngagementLetterSection";

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
  const [uploading, setUploading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [application, setApplication] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [engagementLetter, setEngagementLetter] = useState<any>(null);

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
          quote:quotes(quote_number, sent_at, accepted_at)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      setApplication(data);
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

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    documentType: string
  ) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${organization!.id}/${id}/${documentType}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("onboarding-documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: docError } = await supabase
        .from("onboarding_documents")
        .insert({
          organization_id: organization!.id,
          application_id: id!,
          document_type: documentType,
          file_name: file.name,
          file_path: fileName,
          file_size: file.size,
          mime_type: file.type,
        });

      if (docError) throw docError;

      // Update application document flags
      const updateField = `${documentType}_uploaded`;
      await supabase
        .from("onboarding_applications")
        .update({ [updateField]: true })
        .eq("id", id);

      toast({ title: "Document uploaded successfully" });
      loadDocuments();
      loadApplication();
    } catch (error: any) {
      toast({
        title: "Error uploading document",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    try {
      const { error } = await supabase
        .from("onboarding_applications")
        .update({ status: newStatus })
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Status updated successfully" });
      loadApplication();
    } catch (error: any) {
      toast({
        title: "Error updating status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Use lifecycle_approve_onboarding RPC instead of manual logic
  const approveApplication = async () => {
    setApproving(true);
    try {
      const { data, error } = await supabase.rpc('lifecycle_approve_onboarding', {
        p_onboarding_id: id
      });

      if (error) throw error;

      const result = data as unknown as ApprovalResult;

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

  const canApprove = application.id_document_uploaded && 
                     application.proof_of_address_uploaded &&
                     engagementLetter?.signed_at;

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
                    <Badge variant={application.status === "approved" ? "default" : "secondary"}>
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

            <div className="grid gap-6 md:grid-cols-2">
              {/* Engagement Letter */}
              <EngagementLetterSection
                applicationId={id!}
                organizationId={organization!.id}
                recipientEmail={application.email}
                recipientName={recipientName}
                onLetterStatusChange={loadEngagementLetter}
              />

              {/* Status Management */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Application Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={application.status}
                      onValueChange={updateStatus}
                      disabled={application.status === "approved"}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="contracts_signed">Contracts Signed</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>AML Status</Label>
                    <div className="h-10 px-3 py-2 border rounded-md bg-muted flex items-center">
                      <span className="text-sm capitalize">{application.aml_status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      AML status is automatically verified when application is approved
                    </p>
                  </div>
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
            {application.status !== "approved" && (
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      {!canApprove && (
                        <p className="text-sm text-muted-foreground">
                          To approve: {!engagementLetter?.signed_at && "Engagement letter must be signed. "}
                          {!application.id_document_uploaded && "ID document required. "}
                          {!application.proof_of_address_uploaded && "Proof of address required."}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => updateStatus("rejected")}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        onClick={approveApplication}
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
                    {(application.client_id || application.company_id) && (
                      <Button
                        variant="outline"
                        onClick={() => navigate(
                          application.client_id 
                            ? `/clients/${application.client_id}` 
                            : `/clients/${application.company_id}`
                        )}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View {application.application_type === "individual" ? "Client" : "Company"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default OnboardingDetail;
