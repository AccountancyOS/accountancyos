import { useState, useRef } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileUp, Download, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DataImportStepProps {
  organizationId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export const DataImportStep = ({ organizationId, onComplete, onSkip }: DataImportStepProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate both MIME type and extension
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (file.type === "text/csv" && ext === "csv") {
      setUploadedFile(file);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV file.",
        variant: "destructive",
      });
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Safe JSON parse helper - returns null on invalid JSON
  const safeJsonParse = (str: string | null | undefined): unknown => {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      console.warn("Invalid JSON in CSV field:", str);
      return null;
    }
  };

  const handleImport = async () => {
    if (!uploadedFile) return;

    setImporting(true);
    try {
      const text = await uploadedFile.text();

      // Use PapaParse for proper CSV parsing (handles quoted fields, commas in values, etc.)
      const parseResult = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase(),
      });

      if (parseResult.errors.length > 0) {
        console.warn("CSV parse warnings:", parseResult.errors);
      }

      let importedCount = 0;
      let errorCount = 0;

      for (const data of parseResult.data) {
        // Skip rows without required fields
        if (!data.type || !data.email) continue;

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
          errorCount++;
          continue;
        }

        if (data.type === "individual") {
          const { error } = await supabase.from("clients").insert({
            organization_id: organizationId,
            first_name: data.first_name || null,
            last_name: data.last_name || null,
            email: data.email,
            phone: data.phone || null,
            date_of_birth: data.date_of_birth || null,
            national_insurance_number: data.national_insurance_number || null,
            utr: data.utr || null,
            address_line_1: data.address_line_1 || null,
            address_line_2: data.address_line_2 || null,
            city: data.city || null,
            postcode: data.postcode || null,
            country: data.country || null,
            notes: data.notes || null,
            tags: safeJsonParse(data.tags),
          });

          if (!error) {
            importedCount++;
          } else {
            console.warn("Failed to import client:", error.message);
            errorCount++;
          }
        } else if (data.type === "company") {
          const { error } = await supabase.from("companies").insert({
            organization_id: organizationId,
            company_name: data.company_name || null,
            email: data.email,
            phone: data.phone || null,
            company_number: data.company_number || null,
            incorporation_date: data.incorporation_date || null,
            vat_number: data.vat_number || null,
            year_end_month: data.year_end_month ? parseInt(data.year_end_month, 10) : null,
            year_end_day: data.year_end_day ? parseInt(data.year_end_day, 10) : null,
            address_line_1: data.address_line_1 || null,
            address_line_2: data.address_line_2 || null,
            city: data.city || null,
            postcode: data.postcode || null,
            country: data.country || null,
            notes: data.notes || null,
            tags: safeJsonParse(data.tags),
          });

          if (!error) {
            importedCount++;
          } else {
            console.warn("Failed to import company:", error.message);
            errorCount++;
          }
        }
      }

      const description = errorCount > 0
        ? `Successfully imported ${importedCount} clients. ${errorCount} rows had errors.`
        : `Successfully imported ${importedCount} clients.`;

      toast({
        title: "Import complete",
        description,
      });

      onComplete();
    } catch (error: any) {
      toast({
        title: "Error importing data",
        description: "Failed to parse CSV file. Please check the format.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "type",
      "first_name",
      "last_name",
      "company_name",
      "email",
      "phone",
      "date_of_birth",
      "national_insurance_number",
      "utr",
      "company_number",
      "incorporation_date",
      "vat_number",
      "year_end_month",
      "year_end_day",
      "address_line_1",
      "address_line_2",
      "city",
      "postcode",
      "country",
      "notes",
      "tags"
    ];
    
    const exampleRows = [
      ["individual", "John", "Smith", "", "john.smith@example.com", "07123456789", "1980-05-15", "AB123456C", "1234567890", "", "", "", "", "", "123 High Street", "", "London", "SW1A 1AA", "UK", "VIP client", "[]"],
      ["company", "", "", "Acme Ltd", "contact@acme.com", "02012345678", "", "", "", "12345678", "2020-01-01", "GB123456789", "12", "31", "456 Business Park", "Suite 10", "Manchester", "M1 1AA", "UK", "Key account", "[]"]
    ];
    
    const csv = [headers.join(","), ...exampleRows.map(row => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "client-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Template downloaded",
      description: "Fill in the CSV template and upload it to import your clients.",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadedFile) {
      await handleImport();
    } else {
      onComplete();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Import Existing Data (Optional)</CardTitle>
            <CardDescription>
              Import your existing clients, companies, and engagements from CSV files
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6 space-y-3">
                  {uploadedFile ? (
                    <CheckCircle2 className="h-8 w-8 text-primary" />
                  ) : (
                    <FileUp className="h-8 w-8 text-muted-foreground" />
                  )}
                  <div>
                    <h4 className="font-semibold text-sm">Import Clients</h4>
                    <p className="text-xs text-muted-foreground">
                      {uploadedFile 
                        ? `Selected: ${uploadedFile.name}` 
                        : "Upload all client data including individuals, companies, and engagements (CSV)"}
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={handleUploadClick}
                    type="button"
                  >
                    {uploadedFile ? "Change File" : "Upload CSV"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 space-y-3">
                  <Download className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <h4 className="font-semibold text-sm">Download Template</h4>
                    <p className="text-xs text-muted-foreground">Get CSV template with all required headings</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={handleDownloadTemplate}
                    type="button"
                  >
                    Download
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> Data import is optional. You can always import data later from the settings menu.
                Click "Skip & Finish" to complete setup and start using AccountancyOS.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        {uploadedFile ? (
          <>
            <Button type="button" variant="outline" onClick={onComplete}>
              Skip & Finish Setup
            </Button>
            <Button type="submit" disabled={importing}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import & Finish Setup
            </Button>
          </>
        ) : (
          <Button type="button" onClick={onComplete}>
            Skip & Finish Setup
          </Button>
        )}
      </div>
    </form>
  );
};
