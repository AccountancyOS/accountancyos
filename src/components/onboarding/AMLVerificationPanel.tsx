import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Shield, CheckCircle, Clock, AlertTriangle, FileText, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface AMLVerificationPanelProps {
  onboardingId: string;
  amlStatus: string;
  amlVerifiedAt: string | null;
  amlExpiryDate: string | null;
  idDocumentUploaded: boolean;
  proofOfAddressUploaded: boolean;
  clientInfo: {
    firstName: string;
    lastName: string;
    companyName?: string;
    dateOfBirth?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
  documents: Array<{
    id: string;
    name: string;
    type: string;
    storagePath: string;
  }>;
  onVerified: () => void;
}

export function AMLVerificationPanel({
  onboardingId,
  amlStatus,
  amlVerifiedAt,
  amlExpiryDate,
  idDocumentUploaded,
  proofOfAddressUploaded,
  clientInfo,
  documents,
  onVerified,
}: AMLVerificationPanelProps) {
  const [verifying, setVerifying] = useState(false);
  const [nameMatches, setNameMatches] = useState(false);
  const [addressMatches, setAddressMatches] = useState(false);
  const [documentsGenuine, setDocumentsGenuine] = useState(false);

  const isVerified = amlStatus === "verified";
  const canVerify = nameMatches && addressMatches && documentsGenuine && idDocumentUploaded && proofOfAddressUploaded;

  const typeLabel = (type: string) => {
    if (type === "id") return "ID Document";
    if (type === "proof_of_address") return "Proof of Address";
    return type
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  const handleVerify = async () => {
    if (!canVerify) return;

    setVerifying(true);
    try {
      const { data, error } = await supabase.rpc("verify_aml_and_approve" as any, {
        p_onboarding_id: onboardingId,
      });

      if (error) throw error;

      const result = (data ?? {}) as any;
      if (result.approval_error) {
        toast.warning(
          "AML verified, but client creation failed: " + result.approval_error
        );
      } else if (result.already_finalized) {
        toast.success("AML verification completed");
      } else {
        toast.success("AML verified — client created and portal invite queued");
      }
      onVerified();
    } catch (error: any) {
      console.error("Error verifying AML:", error);
      toast.error(error.message || "Failed to verify AML");
    } finally {
      setVerifying(false);
    }
  };

  const downloadDocument = async (storagePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("onboarding-documents")
        .download(storagePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Error downloading document:", error);
      toast.error("Failed to download document");
    }
  };

  const statusConfig = {
    pending: {
      label: "Pending Verification",
      variant: "outline" as const,
      icon: Clock,
    },
    verified: {
      label: "Verified",
      variant: "default" as const,
      icon: CheckCircle,
    },
    failed: {
      label: "Failed",
      variant: "destructive" as const,
      icon: AlertTriangle,
    },
  };

  const config = statusConfig[amlStatus as keyof typeof statusConfig] || statusConfig.pending;
  const StatusIcon = config.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">AML Verification</CardTitle>
          </div>
          <Badge variant={config.variant}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </div>
        <CardDescription>
          Verify client identity against uploaded documents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isVerified ? (
          <div className="space-y-3">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">AML Verified</span>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Verified on: {amlVerifiedAt ? format(new Date(amlVerifiedAt), "PPp") : "N/A"}</p>
                <p>Expires: {amlExpiryDate ? format(new Date(amlExpiryDate), "PP") : "N/A"}</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Client Information */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Client Information</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Name:</span>
                  <p className="font-medium">
                    {clientInfo.companyName || `${clientInfo.firstName} ${clientInfo.lastName}`}
                  </p>
                </div>
                {clientInfo.dateOfBirth && (
                  <div>
                    <span className="text-muted-foreground">Date of Birth:</span>
                    <p className="font-medium">{format(new Date(clientInfo.dateOfBirth), "PP")}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <span className="text-muted-foreground">Address:</span>
                  <p className="font-medium">
                    {[
                      clientInfo.addressLine1,
                      clientInfo.addressLine2,
                      clientInfo.city,
                      clientInfo.postcode,
                      clientInfo.country,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Uploaded Documents */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Uploaded Documents</h4>
              <div className="space-y-2">
                {documents.length === 0 ? (
                  <>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">ID Document</span>
                      </div>
                      <Badge variant="outline">Not Uploaded</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Proof of Address</span>
                      </div>
                      <Badge variant="outline">Not Uploaded</Badge>
                    </div>
                  </>
                ) : (
                  documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm truncate">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {typeLabel(doc.type)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="default" className="bg-green-600">
                          Uploaded
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={doc.name}
                          aria-label={`Download ${doc.name}`}
                          onClick={() => downloadDocument(doc.storagePath, doc.name)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Separator />

            {/* Verification Checklist */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Verification Checklist</h4>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="name-matches"
                    checked={nameMatches}
                    onCheckedChange={(checked) => setNameMatches(checked === true)}
                    disabled={!idDocumentUploaded}
                  />
                  <Label htmlFor="name-matches" className="text-sm">
                    Name matches ID document
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="address-matches"
                    checked={addressMatches}
                    onCheckedChange={(checked) => setAddressMatches(checked === true)}
                    disabled={!proofOfAddressUploaded}
                  />
                  <Label htmlFor="address-matches" className="text-sm">
                    Address matches proof of address
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="documents-genuine"
                    checked={documentsGenuine}
                    onCheckedChange={(checked) => setDocumentsGenuine(checked === true)}
                    disabled={!idDocumentUploaded || !proofOfAddressUploaded}
                  />
                  <Label htmlFor="documents-genuine" className="text-sm">
                    Documents are genuine and not expired
                  </Label>
                </div>
              </div>
            </div>

            <Button
              onClick={handleVerify}
              disabled={!canVerify || verifying}
              className="w-full"
            >
              {verifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Verify AML
                </>
              )}
            </Button>

            {(!idDocumentUploaded || !proofOfAddressUploaded) && (
              <p className="text-xs text-muted-foreground text-center">
                Waiting for client to upload required documents
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
