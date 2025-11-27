import { useQuery } from "@tanstack/react-query";
import PortalLayout from "@/components/portal/PortalLayout";
import { usePortal } from "@/lib/portal-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FolderOpen, Download, FileText, File, FileImage, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";

export default function PortalDocuments() {
  const { currentSpace } = usePortal();

  const entityType = currentSpace?.type || 'client';
  const entityId = currentSpace?.id || '';

  const { data: documents, isLoading } = useQuery({
    queryKey: ['portal-documents', entityType, entityId],
    queryFn: async () => {
      // Get jobs for this entity first
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id')
        .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId);

      if (!jobs || jobs.length === 0) return [];

      const jobIds = jobs.map(j => j.id);

      const { data, error } = await supabase
        .from('job_documents')
        .select('*')
        .in('job_id', jobIds)
        .order('uploaded_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!entityId
  });

  if (!currentSpace) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No space selected</p>
        </div>
      </PortalLayout>
    );
  }

  const getFileIcon = (mimeType: string | null) => {
    if (!mimeType) return File;
    if (mimeType.includes('pdf')) return FileText;
    if (mimeType.includes('image')) return FileImage;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
    return File;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-muted-foreground">Access your files and documents</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              All Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : documents && documents.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => {
                    const FileIcon = getFileIcon(doc.mime_type);
                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileIcon className="h-4 w-4 text-muted-foreground" />
                            {doc.file_name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {doc.mime_type?.split('/')[1]?.toUpperCase() || 'FILE'}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatFileSize(doc.file_size)}</TableCell>
                        <TableCell>
                          {format(new Date(doc.uploaded_at), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">No documents yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
