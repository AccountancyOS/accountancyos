import { useState, useRef } from "react";
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
  Filter,
  Loader2,
  Folder,
  FolderPlus,
  FolderOpen,
  Pencil,
  FolderInput,
} from "lucide-react";
import { format } from "date-fns";
import { DocumentSignatureFlow } from "@/components/documents/DocumentSignatureFlow";
import { downloadDocument, uploadJobDocument } from "@/lib/document-service";

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
  folder_id: string | null;
  jobs?: { name: string } | null;
}

interface DocFolder {
  id: string;
  name: string;
  parent_id: string | null;
}

type FilterType = "all" | "visible" | "signature_pending" | "signed";

export default function ClientDocumentsTab({ clientId }: ClientDocumentsTabProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [signatureDoc, setSignatureDoc] = useState<JobDocument | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const { data: folders = [] } = useQuery({
    queryKey: ["client-document-folders", clientId, organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("document_folders")
        .select("id,name,parent_id")
        .eq("organization_id", organization.id)
        .eq("client_id", clientId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as DocFolder[];
    },
    enabled: !!organization?.id && !!clientId,
  });

  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      if (!organization?.id) throw new Error("No organization");
      const { error } = await supabase.from("document_folders").insert({
        organization_id: organization.id,
        client_id: clientId,
        name: name.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-document-folders"] });
      setNewFolderName("");
      setFolderDialogOpen(false);
      toast({ title: "Folder created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const renameFolder = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from("document_folders")
        .update({ name: name.trim() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-document-folders"] });
      setRenameFolderId(null);
      toast({ title: "Folder renamed" });
    },
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("document_folders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-document-folders"] });
      queryClient.invalidateQueries({ queryKey: ["client-documents"] });
      if (selectedFolderId) setSelectedFolderId(null);
      toast({ title: "Folder deleted. Documents moved to root." });
    },
  });

  const moveToFolder = useMutation({
    mutationFn: async ({ docIds, folderId }: { docIds: string[]; folderId: string | null }) => {
      const { error } = await supabase
        .from("job_documents")
        .update({ folder_id: folderId })
        .in("id", docIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-documents"] });
      setSelectedDocs([]);
      toast({ title: "Documents moved" });
    },
  });

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
          folder_id,
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
    if (selectedFolderId && doc.folder_id !== selectedFolderId) return false;
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
      // Guard: check for signed documents before deletion
      const { data: docs } = await supabase
        .from("job_documents")
        .select("id, signed_at")
        .in("id", docIds);

      const signedDocs = docs?.filter(d => d.signed_at) || [];
      if (signedDocs.length > 0) {
        throw new Error(`Cannot delete ${signedDocs.length} signed document(s). Signed documents must be retained for compliance.`);
      }

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

  const handleDownload = async (doc: JobDocument) => {
    setDownloading(doc.id);
    const { success, error } = await downloadDocument(doc.file_path, doc.file_name);
    if (!success) {
      toast({ title: "Download failed", description: error, variant: "destructive" });
    }
    setDownloading(null);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !organization?.id) return;

    // Get first job for this client to attach document to
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("client_id", clientId)
      .limit(1);

    if (!jobs || jobs.length === 0) {
      toast({
        title: "No job found",
        description: "Create a job for this client first to upload documents.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    const file = files[0];
    
    const { success, error } = await uploadJobDocument(file, {
      jobId: jobs[0].id,
      organizationId: organization.id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      clientVisible: true,
    });

    if (success) {
      if (selectedFolderId) {
        const { data: justUploaded } = await supabase
          .from("job_documents")
          .select("id")
          .eq("organization_id", organization.id)
          .eq("job_id", jobs[0].id)
          .eq("file_name", file.name)
          .order("uploaded_at", { ascending: false })
          .limit(1);
        if (justUploaded?.[0]) {
          await supabase
            .from("job_documents")
            .update({ folder_id: selectedFolderId })
            .eq("id", justUploaded[0].id);
        }
      }
      toast({ title: "Document uploaded" });
      queryClient.invalidateQueries({ queryKey: ["client-documents"] });
    } else {
      toast({ title: "Upload failed", description: error, variant: "destructive" });
    }

    setUploading(false);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <>
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png"
      />

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
        {/* Folder sidebar */}
        <Card className="h-fit">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Folders</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setFolderDialogOpen(true)}>
              <FolderPlus className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            <button
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left ${
                !selectedFolderId ? "bg-muted font-medium" : "hover:bg-muted/50"
              }`}
              onClick={() => setSelectedFolderId(null)}
            >
              <FolderOpen className="h-4 w-4" /> All Documents
            </button>
            {folders.map((f) => (
              <div
                key={f.id}
                className={`group flex items-center gap-1 px-2 py-1.5 rounded text-sm ${
                  selectedFolderId === f.id ? "bg-muted font-medium" : "hover:bg-muted/50"
                }`}
              >
                <button
                  className="flex-1 flex items-center gap-2 text-left"
                  onClick={() => setSelectedFolderId(f.id)}
                >
                  <Folder className="h-4 w-4" />
                  {renameFolderId === f.id ? (
                    <input
                      autoFocus
                      className="bg-transparent border-b border-primary outline-none text-sm w-full"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => {
                        if (renameValue.trim() && renameValue !== f.name) {
                          renameFolder.mutate({ id: f.id, name: renameValue });
                        } else {
                          setRenameFolderId(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") setRenameFolderId(null);
                      }}
                    />
                  ) : (
                    <span className="truncate">{f.name}</span>
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setRenameFolderId(f.id);
                        setRenameValue(f.name);
                      }}
                    >
                      <Pencil className="h-4 w-4 mr-2" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Delete folder "${f.name}"? Documents inside will move to All Documents.`)) {
                          deleteFolder.mutate(f.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            {folders.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-2">
                No folders. Create one to organize documents.
              </p>
            )}
          </CardContent>
        </Card>

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
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <FolderInput className="h-4 w-4 mr-1" />
                    Move to Folder
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={() => moveToFolder.mutate({ docIds: selectedDocs, folderId: null })}
                  >
                    No folder
                  </DropdownMenuItem>
                  {folders.length > 0 && <DropdownMenuSeparator />}
                  {folders.map((f) => (
                    <DropdownMenuItem
                      key={f.id}
                      onClick={() => moveToFolder.mutate({ docIds: selectedDocs, folderId: f.id })}
                    >
                      <Folder className="h-4 w-4 mr-2" />
                      {f.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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
                      <DropdownMenuItem 
                        onClick={() => handleDownload(doc)}
                        disabled={downloading === doc.id}
                      >
                        {downloading === doc.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
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
      </div>

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

      {/* Create Folder Dialog */}
      <AlertDialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Folders help organize this client's documents (e.g., "VAT 2025", "Bank Statements").
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            autoFocus
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newFolderName.trim()) {
                createFolder.mutate(newFolderName);
              }
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => createFolder.mutate(newFolderName)}
              disabled={!newFolderName.trim()}
            >
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
