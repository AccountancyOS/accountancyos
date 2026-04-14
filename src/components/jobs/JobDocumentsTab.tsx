import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { uploadJobDocument, downloadDocument } from "@/lib/document-service";

interface JobDocumentsTabProps {
  jobId: string;
}

export default function JobDocumentsTab({ jobId }: JobDocumentsTabProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: documents, isLoading } = useQuery({
    queryKey: ["job-documents", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_documents")
        .select("*")
        .eq("job_id", jobId)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !organization?.id) return;

    setUploading(true);
    const file = files[0];

    const { success, error } = await uploadJobDocument(file, {
      jobId,
      organizationId: organization.id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      clientVisible: false,
    });

    if (success) {
      toast({ title: "Document uploaded" });
      queryClient.invalidateQueries({ queryKey: ["job-documents", jobId] });
    } else {
      toast({ title: "Upload failed", description: error, variant: "destructive" });
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    setDownloading(filePath);
    const { success, error } = await downloadDocument(filePath, fileName);
    if (!success) {
      toast({ title: "Download failed", description: error, variant: "destructive" });
    }
    setDownloading(null);
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png"
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Documents</CardTitle>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Upload Document
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading documents...</p>
          ) : !documents || documents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No documents yet</p>
              <p className="text-sm text-muted-foreground">
                Documents from questionnaires and task uploads will appear here automatically
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Uploaded {format(new Date(doc.uploaded_at), "dd MMM yyyy")}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={downloading === doc.file_path}
                    onClick={() => handleDownload(doc.file_path, doc.file_name)}
                  >
                    {downloading === doc.file_path ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
