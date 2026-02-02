import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { 
  Upload, 
  FileText, 
  MoreVertical, 
  Eye, 
  EyeOff, 
  PenLine, 
  Trash2,
  Download,
  CheckCircle,
  Clock,
  Filter
} from "lucide-react";
import { format } from "date-fns";
import { DocumentSignatureFlow } from "@/components/documents/DocumentSignatureFlow";

interface ClientDocumentsTabProps {
  clientId: string;
}

interface JobDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_at: string;
  client_visible: boolean;
  signature_required: boolean;
  signed_at: string | null;
  signed_by: string | null;
  signature_typed_name: string | null;
  archived: boolean;
  job_id: string;
  jobs?: { name: string } | null;
}

type FilterType = "all" | "visible" | "signature_pending" | "signed";

export default function ClientDocumentsTab({ clientId }: ClientDocumentsTabProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [signatureDoc, setSignatureDoc] = useState<JobDocument | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");

  const { data: documents, isLoading } = useQuery({
    queryKey: ["client-documents", clientId, organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      // Get jobs for this client first
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("client_id", clientId);

      if (!jobs || jobs.length === 0) return [];

      const jobIds = jobs.map(j => j.id);
      
      const { data, error } = await supabase
        .from("job_documents")
        .select(`
          id,
          file_name,
          file_path,
          file_size,
          mime_type,
          uploaded_at,
          client_visible,
          signature_required,
          signed_at,
          signed_by,
          signature_typed_name,
          archived,
          job_id,
          jobs:job_id (name)
        `)
        .eq("organization_id", organization.id)
        .in("job_id", jobIds)
        .eq("archived", false)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      return (data || []) as JobDocument[];
    },
    enabled: !!organization?.id && !!clientId,
  });

  const filteredDocs = documents?.filter(doc => {
    switch (filter) {
      case "visible": return doc.client_visible;
      case "signature_pending": return doc.signature_required && !doc.signed_at;
      case "signed": return doc.signature_required && doc.signed_at;
      default: return true;
    }
  }) || [];

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ docIds, visible }: { docIds: string[]; visible: boolean }) => {
      const { error } = await supabase
        .from("job_documents")
        .update({ client_visible: visible })
        .in("id", docIds);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-documents"] });
      setSelectedDocs([]);
      toast({ title: "Document visibility updated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleSignatureRequiredMutation = useMutation({
    mutationFn: async ({ docIds, required }: { docIds: string[]; required: boolean }) => {
      const { error } = await supabase
        .from("job_documents")
        .update({ signature_required: required })
        .in("id", docIds);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-documents"] });
      setSelectedDocs([]);
      toast({ title: "Signature requirement updated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docIds: string[]) => {
      const { error } = await supabase
        .from("job_documents")
        .delete()
        .in("id", docIds);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-documents"] });
      setSelectedDocs([]);
      setDeleteDialogOpen(false);
      toast({ title: "Documents deleted" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleSelectAll = () => {
    if (selectedDocs.length === filteredDocs.length) {
      setSelectedDocs([]);
    } else {
      setSelectedDocs(filteredDocs.map(d => d.id));
    }
  };

  const toggleSelect = (docId: string) => {
    setSelectedDocs(prev => 
      prev.includes(docId) 
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              Shared files and documents requiring signature
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  {filter === "all" ? "All" : filter === "visible" ? "Visible" : filter === "signature_pending" ? "Pending Signature" : "Signed"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setFilter("all")}>All Documents</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilter("visible")}>Client Visible</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilter("signature_pending")}>Pending Signature</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilter("signed")}>Signed</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button>
              <Upload className="mr-2 h-4 w-4" />
              Upload Document
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions */}
          {selectedDocs.length > 0 && (
            <div className="mb-4 flex items-center gap-2 p-2 bg-muted rounded-md">
              <span className="text-sm text-muted-foreground">
                {selectedDocs.length} selected
              </span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => toggleVisibilityMutation.mutate({ docIds: selectedDocs, visible: true })}
              >
                <Eye className="h-4 w-4 mr-1" />
                Make Visible
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => toggleVisibilityMutation.mutate({ docIds: selectedDocs, visible: false })}
              >
                <EyeOff className="h-4 w-4 mr-1" />
                Hide
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => toggleSignatureRequiredMutation.mutate({ docIds: selectedDocs, required: true })}
              >
                <PenLine className="h-4 w-4 mr-1" />
                Require Signature
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No documents found.</p>
              <p className="text-sm mt-1">Upload documents from jobs to share with this client.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header */}
              <div className="flex items-center gap-4 px-3 py-2 text-sm font-medium text-muted-foreground border-b">
                <Checkbox
                  checked={selectedDocs.length === filteredDocs.length && filteredDocs.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="flex-1">Document</span>
                <span className="w-24">Job</span>
                <span className="w-20">Size</span>
                <span className="w-28">Status</span>
                <span className="w-24">Uploaded</span>
                <span className="w-10" />
              </div>

              {/* Document List */}
              {filteredDocs.map(doc => (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 px-3 py-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <Checkbox
                    checked={selectedDocs.includes(doc.id)}
                    onCheckedChange={() => toggleSelect(doc.id)}
                  />
                  <div className="flex-1 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{doc.file_name}</span>
                    {doc.client_visible && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        <Eye className="h-3 w-3 mr-1" />
                        Visible
                      </Badge>
                    )}
                  </div>
                  <span className="w-24 text-sm text-muted-foreground truncate">
                    {doc.jobs?.name || "—"}
                  </span>
                  <span className="w-20 text-sm text-muted-foreground">
                    {formatFileSize(doc.file_size)}
                  </span>
                  <div className="w-28">
                    {doc.signature_required ? (
                      doc.signed_at ? (
                        <Badge variant="secondary" className="text-xs text-green-700 dark:text-green-300">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Signed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-amber-700 dark:text-amber-300">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                  <span className="w-24 text-sm text-muted-foreground">
                    {format(new Date(doc.uploaded_at), "dd MMM yyyy")}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => toggleVisibilityMutation.mutate({ 
                          docIds: [doc.id], 
                          visible: !doc.client_visible 
                        })}
                      >
                        {doc.client_visible ? (
                          <>
                            <EyeOff className="h-4 w-4 mr-2" />
                            Hide from Client
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4 mr-2" />
                            Make Visible
                          </>
                        )}
                      </DropdownMenuItem>
                      {doc.signature_required && !doc.signed_at && (
                        <DropdownMenuItem onClick={() => setSignatureDoc(doc)}>
                          <PenLine className="h-4 w-4 mr-2" />
                          Sign Document
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => {
                          setSelectedDocs([doc.id]);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Documents</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedDocs.length} document(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteMutation.mutate(selectedDocs)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Signature Flow Dialog */}
      {signatureDoc && (
        <DocumentSignatureFlow
          open={!!signatureDoc}
          onOpenChange={(open) => !open && setSignatureDoc(null)}
          document={signatureDoc}
        />
      )}
    </>
  );
}
