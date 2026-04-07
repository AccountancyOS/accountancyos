import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { Shield, Download, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { toast } from "sonner";

export function GdprCompliancePanel() {
  const { organization } = useOrganization();
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const handleExportData = async () => {
    if (!organization?.id) return;
    setIsExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('gdpr-data-export', {
        body: { organization_id: organization.id },
      });

      if (error) throw error;

      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gdpr-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Data export downloaded successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to export data");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteData = async () => {
    if (!organization?.id || deleteConfirmation !== 'DELETE_ALL_DATA') return;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('gdpr-data-deletion', {
        body: {
          organization_id: organization.id,
          confirmation: 'DELETE_ALL_DATA',
        },
      });

      if (error) throw error;

      toast.success("Data deletion completed. PII has been anonymized.");
      setDeleteConfirmation("");
    } catch (error: any) {
      toast.error(error.message || "Failed to process deletion request");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          GDPR & Data Protection
        </CardTitle>
        <CardDescription>
          UK GDPR compliance tools for data portability and right to erasure
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Data Retention Policy */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Data Retention Policy</h4>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Financial records: 7 years</Badge>
            <Badge variant="outline">Audit logs: Indefinite</Badge>
            <Badge variant="outline">Documents: 7-year auto-archive</Badge>
            <Badge variant="outline">PII: Until deletion requested</Badge>
          </div>
        </div>

        <Separator />

        {/* Data Export (Article 20 - Right to Data Portability) */}
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium">Data Export</h4>
            <p className="text-xs text-muted-foreground">
              GDPR Article 20 — Download all organisation data in a machine-readable format (JSON).
              Includes clients, contacts, companies, jobs, filings, invoices, and audit history.
            </p>
          </div>
          <Button
            onClick={handleExportData}
            disabled={isExporting}
            variant="outline"
          >
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating export...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export All Data
              </>
            )}
          </Button>
        </div>

        <Separator />

        {/* Data Deletion (Article 17 - Right to Erasure) */}
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Data Deletion
            </h4>
            <p className="text-xs text-muted-foreground">
              GDPR Article 17 — Right to Erasure. All personally identifiable information (names, emails,
              NINOs, UTRs, phone numbers) will be permanently anonymized. Financial records are retained
              in anonymized form for 7 years per UK regulatory requirements. This action cannot be undone.
            </p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Request Data Deletion
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Confirm Data Deletion
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p>
                    This will permanently anonymize all personally identifiable information
                    across your organisation. This includes client names, contact details,
                    NINOs, UTRs, and all other PII.
                  </p>
                  <p className="font-medium">
                    Financial records will be retained in anonymized form for 7 years
                    per UK HMRC requirements.
                  </p>
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="delete-confirm">
                      Type <code className="bg-muted px-1 py-0.5 rounded text-xs">DELETE_ALL_DATA</code> to confirm:
                    </Label>
                    <Input
                      id="delete-confirm"
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      placeholder="DELETE_ALL_DATA"
                    />
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirmation("")}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteData}
                  disabled={deleteConfirmation !== 'DELETE_ALL_DATA' || isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Permanently Delete Data"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
