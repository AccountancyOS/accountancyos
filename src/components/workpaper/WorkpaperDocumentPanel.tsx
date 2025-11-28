/**
 * Workpaper Document Panel
 * Side panel showing documents linked to workpaper categories/lines
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  FileImage,
  File,
  Download,
  ExternalLink,
  Upload,
  X,
  FolderOpen,
} from "lucide-react";
import { format } from "date-fns";

interface WorkpaperDocumentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  workpaperId: string;
  jobId: string;
  selectedCategory?: string;
  categoryLabel?: string;
}

interface LinkedDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_size?: number;
  mime_type?: string;
  uploaded_at: string;
  tags?: { type?: string; category?: string }[];
  source: "questionnaire" | "upload" | "job_document";
}

const fileIcons: Record<string, React.ComponentType<any>> = {
  "application/pdf": FileText,
  "image/": FileImage,
  default: File,
};

function getFileIcon(mimeType?: string) {
  if (!mimeType) return File;
  if (mimeType.includes("pdf")) return FileText;
  if (mimeType.startsWith("image/")) return FileImage;
  return File;
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkpaperDocumentPanel({
  isOpen,
  onClose,
  workpaperId,
  jobId,
  selectedCategory,
  categoryLabel,
}: WorkpaperDocumentPanelProps) {
  // Fetch documents linked to this workpaper/job
  const { data: documents, isLoading } = useQuery({
    queryKey: ["workpaper-documents", workpaperId, jobId, selectedCategory],
    queryFn: async () => {
      // Fetch job documents
      const { data: jobDocs, error: jobDocsError } = await supabase
        .from("job_documents")
        .select("*")
        .eq("job_id", jobId);

      if (jobDocsError) throw jobDocsError;

      // Transform and filter documents
      const docs: LinkedDocument[] = (jobDocs || []).map((doc) => ({
        id: doc.id,
        file_name: doc.file_name,
        file_path: doc.file_path,
        file_size: doc.file_size || undefined,
        mime_type: doc.mime_type || undefined,
        uploaded_at: doc.uploaded_at,
        tags: doc.tags as any,
        source: "job_document" as const,
      }));

      // Filter by category if specified
      if (selectedCategory) {
        return docs.filter((doc) => {
          const tags = doc.tags || [];
          return tags.some(
            (tag: any) =>
              tag?.category?.toLowerCase() === selectedCategory.toLowerCase()
          );
        });
      }

      return docs;
    },
    enabled: isOpen && !!jobId,
  });

  const handleDownload = async (doc: LinkedDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from("job-documents")
        .download(doc.file_path);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            {selectedCategory ? "Linked Documents" : "All Workpaper Documents"}
          </SheetTitle>
          <SheetDescription>
            {selectedCategory
              ? `Documents linked to: ${categoryLabel || selectedCategory}`
              : "All documents associated with this workpaper"}
          </SheetDescription>
        </SheetHeader>

        <Separator className="my-4" />

        {selectedCategory && (
          <div className="mb-4">
            <Badge variant="outline" className="mb-2">
              Category: {categoryLabel || selectedCategory}
            </Badge>
          </div>
        )}

        <ScrollArea className="h-[calc(100vh-200px)]">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading documents...
            </div>
          ) : documents && documents.length > 0 ? (
            <div className="space-y-3">
              {documents.map((doc) => {
                const FileIcon = getFileIcon(doc.mime_type);
                return (
                  <div
                    key={doc.id}
                    className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-muted rounded">
                        <FileIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {doc.file_name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span>•</span>
                          <span>
                            {format(new Date(doc.uploaded_at), "d MMM yyyy")}
                          </span>
                        </div>
                        {doc.tags && doc.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {doc.tags.map((tag: any, i: number) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="text-xs"
                              >
                                {tag?.type || tag?.category || "Document"}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownload(doc)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <File className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                {selectedCategory
                  ? "No documents linked to this category"
                  : "No documents attached to this workpaper"}
              </p>
              <Button variant="outline" size="sm">
                <Upload className="mr-2 h-4 w-4" />
                Upload Document
              </Button>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
