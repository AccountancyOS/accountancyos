import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText } from "lucide-react";

interface ClientDocumentsTabProps {
  clientId: string;
}

export default function ClientDocumentsTab({ clientId }: ClientDocumentsTabProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            Shared files and client uploads
          </CardDescription>
        </div>
        <Button>
          <Upload className="mr-2 h-4 w-4" />
          Upload Document
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">
          Document vault coming soon. This will show:
        </p>
        <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
          <li>Documents shared with the client (returns, reports, accounts)</li>
          <li>Documents uploaded by the client</li>
          <li>Filters by year, service type, and document category</li>
          <li>Version history and secure download links</li>
        </ul>
      </CardContent>
    </Card>
  );
}
