import { useQuery } from "@tanstack/react-query";
import { listJobArtifacts, type JobArtifact, type ArtifactType } from "@/lib/job-artifacts-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-utils";
import {
  FileText,
  ClipboardCheck,
  FileSpreadsheet,
  Upload,
  Camera,
  Calculator,
  ExternalLink,
} from "lucide-react";
import { TableSkeleton } from "@/components/ui/table-skeleton";

const ARTIFACT_ICON: Record<ArtifactType, typeof FileText> = {
  document: FileText,
  questionnaire_submission: ClipboardCheck,
  workpaper_schedule: FileSpreadsheet,
  external_workpaper: Upload,
  filing_snapshot: Camera,
  computation_output: Calculator,
};

const ARTIFACT_LABEL: Record<ArtifactType, string> = {
  document: "Document",
  questionnaire_submission: "Questionnaire",
  workpaper_schedule: "Workpaper Schedule",
  external_workpaper: "External Workpaper",
  filing_snapshot: "Filing Snapshot",
  computation_output: "Computation Output",
};

interface JobArtifactsPanelProps {
  jobId: string;
  onViewDocument?: (artifactId: string, sourceDocId: string) => void;
}

export default function JobArtifactsPanel({ jobId, onViewDocument }: JobArtifactsPanelProps) {
  const { data: artifacts, isLoading } = useQuery({
    queryKey: ["job-artifacts", jobId],
    queryFn: () => listJobArtifacts(jobId, { status: "active" }),
    enabled: !!jobId,
  });

  const grouped = (artifacts ?? []).reduce<Record<string, JobArtifact[]>>((acc, a) => {
    const key = a.artifact_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  const typeOrder: ArtifactType[] = [
    "document",
    "questionnaire_submission",
    "workpaper_schedule",
    "external_workpaper",
    "filing_snapshot",
    "computation_output",
  ];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Job Artifacts</CardTitle>
        </CardHeader>
        <CardContent>
          <TableSkeleton columns={3} rows={3} />
        </CardContent>
      </Card>
    );
  }

  if (!artifacts || artifacts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Job Artifacts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-6">
            No artifacts linked to this job yet. Documents, questionnaires, and workpapers will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job Artifacts ({artifacts.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {typeOrder.map((type) => {
          const items = grouped[type];
          if (!items || items.length === 0) return null;

          const Icon = ARTIFACT_ICON[type];
          return (
            <div key={type}>
              <div className="flex items-center gap-2 mb-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold text-foreground">
                  {ARTIFACT_LABEL[type]} ({items.length})
                </h4>
              </div>
              <div className="space-y-2">
                {items.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(a.created_at, "dayMonthYear")}
                        {a.period_label && ` · ${a.period_label}`}
                        {a.version > 1 && ` · v${a.version}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.locked_at && (
                        <Badge variant="secondary" className="text-xs">Locked</Badge>
                      )}
                      {a.source_document_id && onViewDocument && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onViewDocument(a.id, a.source_document_id!)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
