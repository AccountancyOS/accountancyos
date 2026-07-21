import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, Download, Loader2, CheckCircle2, Circle, Clock, Ban, ListChecks, Filter } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { uploadJobDocument, downloadDocument } from "@/lib/document-service";
import { RecordsRequestManager, useJobRecordsRequests } from "@/components/jobs/RecordsRequestManager";
import { buildRecordsChecklist, type RecordChecklistItem, type RecordState } from "@/lib/job-records-model";
import type { RecordsRequestItem } from "@/lib/job-template-types";

interface JobDocumentsTabProps {
  jobId: string;
  /**
   * jobs.template_id — used to look up job_templates.records_requests_template
   * for the required-records checklist (section C below). Optional: jobs
   * created without a template (or whose template has no records checklist
   * defined) simply fall back to a passthrough of their existing records
   * requests — see src/lib/job-records-model.ts for the full rationale.
   */
  templateId?: string | null;
}

interface JobDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  client_visible: boolean | null;
  tags: { type?: string; category?: string }[] | null;
  uploaded_at: string;
  uploaded_by: string | null;
  task_id: string | null;
  signed_at: string | null;
  version: number | null;
}

// Only filters with a real backing column on job_documents are implemented.
// "Outstanding review" and "Linked to request" were in-scope per the brief
// but were dropped: job_documents.task_id is a foreign key to job_tasks (the
// internal ops tasks), NOT client_tasks (the records requests) — there is no
// column on job_documents that links a document to the request it fulfils,
// and no "reviewed" status column on job_documents either. Faking either
// filter would mean inventing a join that doesn't exist in the schema.
type DocumentFilter = "all" | "client" | "accountant" | "uncategorised";

const DOCUMENT_FILTER_LABEL: Record<DocumentFilter, string> = {
  all: "All",
  client: "Client uploads",
  accountant: "Accountant uploads",
  uncategorised: "Uncategorised",
};

function recordStateBadge(state: RecordState) {
  switch (state) {
    case "reviewed":
      return (
        <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Reviewed
        </Badge>
      );
    case "received":
      return (
        <Badge variant="secondary">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Received
        </Badge>
      );
    case "requested":
      return (
        <Badge variant="outline">
          <Clock className="h-3 w-3 mr-1" />
          Requested
        </Badge>
      );
    case "not_applicable":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <Ban className="h-3 w-3 mr-1" />
          Not applicable
        </Badge>
      );
    case "not_requested":
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <Circle className="h-3 w-3 mr-1" />
          Not requested
        </Badge>
      );
  }
}

export default function JobDocumentsTab({ jobId, templateId }: JobDocumentsTabProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [documentFilter, setDocumentFilter] = useState<DocumentFilter>("all");

  const { data: documents, isLoading } = useQuery({
    queryKey: ["job-documents", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_documents")
        .select("*")
        .eq("job_id", jobId)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      return (data || []) as JobDocument[];
    },
  });

  // Shares the ["job-records-requests", jobId] cache with the embedded
  // RecordsRequestManager below (section A) — same query key + queryFn, so
  // TanStack Query serves both from one fetch instead of duplicating it.
  const { data: requestTasks } = useJobRecordsRequests(jobId);

  // Required-records definition: job_templates.records_requests_template for
  // the template this job was generated from, if any. See the investigation
  // notes in src/lib/job-records-model.ts for why this — not a dedicated
  // checklist/definition table, which does not exist in this schema — is the
  // real source, and for the matching limitation against client_tasks.
  const { data: recordDefinitions } = useQuery({
    queryKey: ["job-records-definition", templateId],
    queryFn: async () => {
      if (!templateId) return [] as RecordsRequestItem[];
      const { data, error } = await supabase
        .from("job_templates")
        .select("records_requests_template")
        .eq("id", templateId)
        .maybeSingle();
      if (error || !data) return [] as RecordsRequestItem[];
      return (data.records_requests_template as unknown as RecordsRequestItem[]) || [];
    },
    enabled: !!templateId,
  });

  const checklist: RecordChecklistItem[] = useMemo(
    () => buildRecordsChecklist(recordDefinitions || [], requestTasks || []),
    [recordDefinitions, requestTasks]
  );

  const filteredDocuments = useMemo(() => {
    if (!documents) return [];
    switch (documentFilter) {
      case "client":
        return documents.filter((d) => d.client_visible === true);
      case "accountant":
        return documents.filter((d) => d.client_visible !== true);
      case "uncategorised":
        return documents.filter((d) => !d.tags || d.tags.length === 0);
      default:
        return documents;
    }
  }, [documents, documentFilter]);

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

  const triggerUpload = () => fileInputRef.current?.click();

  return (
    <div className="space-y-6">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png"
      />

      {/* A. Document requests — reuses RecordsRequestManager wholesale
          (["job-records-requests", jobId] query + its verify/unverify
          mutations) rather than reimplementing anything. */}
      <RecordsRequestManager jobId={jobId} mode="accountant" />

      {/* B. Uploaded documents */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              {documents?.length
                ? `${documents.length} document${documents.length === 1 ? "" : "s"} uploaded`
                : "Files uploaded directly or received from requests"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={documentFilter} onValueChange={(v) => setDocumentFilter(v as DocumentFilter)}>
              <SelectTrigger className="w-[180px] h-9">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DOCUMENT_FILTER_LABEL) as DocumentFilter[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {DOCUMENT_FILTER_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={triggerUpload} disabled={uploading}>
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
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading documents...</p>
          ) : !documents || documents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-1 font-medium">No documents uploaded yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                No documents uploaded yet — upload one directly.
              </p>
              <Button variant="outline" onClick={triggerUpload} disabled={uploading}>
                <Upload className="mr-2 h-4 w-4" />
                Upload a document
              </Button>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <p className="text-muted-foreground mb-4">
                No documents match &ldquo;{DOCUMENT_FILTER_LABEL[documentFilter]}&rdquo;
              </p>
              <Button variant="outline" size="sm" onClick={() => setDocumentFilter("all")}>
                Clear filter
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{doc.file_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
                        <span>Uploaded {format(new Date(doc.uploaded_at), "dd MMM yyyy")}</span>
                        <span>•</span>
                        <Badge variant="outline" className="text-xs">
                          {doc.client_visible ? "Client" : "Accountant"}
                        </Badge>
                        {(!doc.tags || doc.tags.length === 0) && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Uncategorised
                          </Badge>
                        )}
                      </div>
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

      {/* C. Required-records checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            Required Records Checklist
          </CardTitle>
          <CardDescription>
            {recordDefinitions && recordDefinitions.length > 0
              ? "Derived from this job's template records checklist, matched against its requests."
              : "This job has no template-defined records checklist — showing its existing requests instead."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checklist.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ListChecks className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Nothing to check off yet</p>
              <p className="text-sm mt-1">
                No records have been requested for this job yet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                    )}
                  </div>
                  {recordStateBadge(item.state)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
