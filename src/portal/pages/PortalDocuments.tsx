import { useRef, useState } from "react";
import { Download, FolderOpen, Loader2, Upload } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";
import { usePortalDocuments } from "../hooks/usePortalData";
import {
  resolvePortalDocumentUrl,
  listUploadableJobs,
  uploadPortalJobDocument,
} from "../services/portalDocumentsService";
import { usePortalEntity } from "../contexts/PortalEntityContext";
import type { PortalDocument } from "../types";

const SOURCE_LABEL: Record<string, string> = {
  job_document: "Job Document",
  questionnaire_file: "Questionnaire",
  kyc_document: "Onboarding",
  receipt: "Receipt",
};

async function handleDownload(doc: PortalDocument) {
  const url = await resolvePortalDocumentUrl(doc);
  if (!url) {
    toast.error("This document is not currently available.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function UploadCard() {
  const { currentEntity } = usePortalEntity();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [jobId, setJobId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const { data: jobs } = useQuery({
    queryKey: ["portal", "upload-jobs", currentEntity?.type, currentEntity?.id],
    queryFn: () => (currentEntity ? listUploadableJobs(currentEntity) : Promise.resolve([])),
    enabled: !!currentEntity,
  });

  const upload = useMutation({
    mutationFn: async () => {
      const job = (jobs ?? []).find((j) => j.id === jobId);
      if (!job || !file) throw new Error("Choose a job and a file first.");
      const { data: { user } } = await supabase.auth.getUser();
      const res = await uploadPortalJobDocument(job, file, user?.id ?? null);
      if (!res.success) throw new Error(res.error || "Upload failed.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "documents"] });
      toast.success("Document uploaded.");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed."),
  });

  // Nothing to attach a document to yet.
  if (!jobs || jobs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Upload a document</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={jobId} onValueChange={setJobId} disabled={upload.isPending}>
          <SelectTrigger>
            <SelectValue placeholder="Which job is this for?" />
          </SelectTrigger>
          <SelectContent>
            {jobs.map((j) => (
              <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          ref={fileRef}
          type="file"
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-primary-foreground"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={upload.isPending}
        />
        <Button onClick={() => upload.mutate()} disabled={upload.isPending || !jobId || !file}>
          {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Upload
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PortalDocuments() {
  const { data, isLoading } = usePortalDocuments();

  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader
        title="Documents"
        description="Documents shared between you and your accountant."
      />
      <UploadCard />
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <PortalEmptyState
          icon={FolderOpen}
          title="No Documents Yet"
          description="Documents shared by your accountant or uploaded by you will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.map((d) => (
            <Card key={`${d.source}-${d.id}`}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">{d.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {SOURCE_LABEL[d.source] ?? d.source} ·{" "}
                    {new Date(d.uploadedAt).toLocaleDateString("en-GB")}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleDownload(d)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}