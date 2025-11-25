import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Upload, Check, X, FileText } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OnboardingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [application, setApplication] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);

  useEffect(() => {
    if (organization && id) {
      loadApplication();
      loadDocuments();
    }
  }, [organization, id]);

  const loadApplication = async () => {
    try {
      const { data, error } = await supabase
        .from("onboarding_applications")
        .select("*")
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

  const updateAMLStatus = async (newStatus: string) => {
    try {
      const { error } = await supabase
        .from("onboarding_applications")
        .update({ aml_status: newStatus })
        .eq("id", id);

      if (error) throw error;

      toast({ title: "AML status updated successfully" });
      loadApplication();
    } catch (error: any) {
      toast({
        title: "Error updating AML status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const approveApplication = async () => {
    try {
      // Create client or company based on application type
      if (application.application_type === "individual") {
        const { data: client, error: clientError } = await supabase
          .from("clients")
          .insert({
            organization_id: organization!.id,
            first_name: application.first_name,
            last_name: application.last_name,
            email: application.email,
            phone: application.phone,
            date_of_birth: application.date_of_birth,
            national_insurance_number: application.national_insurance_number,
            address_line_1: application.address_line_1,
            address_line_2: application.address_line_2,
            city: application.city,
            postcode: application.postcode,
            country: application.country,
          })
          .select()
          .single();

        if (clientError) throw clientError;

        await supabase
          .from("onboarding_applications")
          .update({
            status: "approved",
            client_id: client.id,
            approved_at: new Date().toISOString(),
          })
          .eq("id", id);
      } else {
        const { data: company, error: companyError } = await supabase
          .from("companies")
          .insert({
            organization_id: organization!.id,
            company_name: application.company_name,
            company_number: application.company_number,
            email: application.email,
            phone: application.phone,
            incorporation_date: application.incorporation_date,
            vat_number: application.vat_number,
            address_line_1: application.address_line_1,
            address_line_2: application.address_line_2,
            city: application.city,
            postcode: application.postcode,
            country: application.country,
          })
          .select()
          .single();

        if (companyError) throw companyError;

        await supabase
          .from("onboarding_applications")
          .update({
            status: "approved",
            company_id: company.id,
            approved_at: new Date().toISOString(),
          })
          .eq("id", id);
      }

      toast({ title: "Application approved and client created" });
      loadApplication();
    } catch (error: any) {
      toast({
        title: "Error approving application",
        description: error.message,
        variant: "destructive",
      });
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

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/onboarding")}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Applications
          </Button>

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">
                      {application.application_type === "individual"
                        ? `${application.first_name} ${application.last_name}`
                        : application.company_name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {application.email}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{application.status}</Badge>
                    <Badge variant="secondary">AML: {application.aml_status}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Application Status</Label>
                    <Select
                      value={application.status}
                      onValueChange={updateStatus}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="aml_review">AML Review</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>AML Status</Label>
                    <Select
                      value={application.aml_status}
                      onValueChange={updateAMLStatus}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="passed">Passed</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="manual_review">Manual Review</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4">Documents</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>ID Document</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          accept=".pdf,.jpg,.png"
                          onChange={(e) => handleFileUpload(e, "id")}
                          disabled={uploading}
                        />
                        {application.id_document_uploaded && (
                          <Check className="h-5 w-5 text-green-500" />
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
                          <Check className="h-5 w-5 text-green-500" />
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
                          <Check className="h-5 w-5 text-green-500" />
                        )}
                      </div>
                    </div>
                  </div>

                  {documents.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <Label>Uploaded Files</Label>
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <FileText className="h-4 w-4" />
                          {doc.file_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {application.status !== "approved" && (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => updateStatus("rejected")}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      onClick={approveApplication}
                      disabled={
                        !application.id_document_uploaded ||
                        !application.proof_of_address_uploaded ||
                        application.aml_status !== "passed"
                      }
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Approve & Create Client
                    </Button>
                  </div>
                )}

                {application.status === "approved" && (
                  <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                    <p className="text-sm font-medium text-green-900 dark:text-green-100">
                      ✓ Application approved and client created successfully
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default OnboardingDetail;
