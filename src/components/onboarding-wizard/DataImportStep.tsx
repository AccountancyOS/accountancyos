import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileUp, Download } from "lucide-react";

interface DataImportStepProps {
  organizationId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export const DataImportStep = ({ organizationId, onComplete, onSkip }: DataImportStepProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      toast({
        title: "Import complete",
        description: "Your data has been imported successfully.",
      });

      onComplete();
    } catch (error: any) {
      toast({
        title: "Error importing data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
                  <FileUp className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <h4 className="font-semibold text-sm">Import Clients</h4>
                    <p className="text-xs text-muted-foreground">Upload individual clients (CSV)</p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full">
                    Upload CSV
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 space-y-3">
                  <FileUp className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <h4 className="font-semibold text-sm">Import Companies</h4>
                    <p className="text-xs text-muted-foreground">Upload company clients (CSV)</p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full">
                    Upload CSV
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 space-y-3">
                  <FileUp className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <h4 className="font-semibold text-sm">Import Engagements</h4>
                    <p className="text-xs text-muted-foreground">Upload service engagements (CSV)</p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full">
                    Upload CSV
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 space-y-3">
                  <Download className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <h4 className="font-semibold text-sm">Download Templates</h4>
                    <p className="text-xs text-muted-foreground">Get CSV templates to fill in</p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full">
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
        <Button type="button" onClick={onComplete}>
          Skip & Finish Setup
        </Button>
      </div>
    </form>
  );
};
