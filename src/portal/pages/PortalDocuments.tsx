import { Download, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";
import { usePortalDocuments } from "../hooks/usePortalData";
import { resolvePortalDocumentUrl } from "../services/portalDocumentsService";
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

export default function PortalDocuments() {
  const { data, isLoading } = usePortalDocuments();

  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader
        title="Documents"
        description="Documents shared between you and your accountant."
      />
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