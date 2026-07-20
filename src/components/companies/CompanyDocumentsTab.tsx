import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Props {
  companyId: string;
}

interface CompanyDoc {
  id: string;
  file_name: string;
  file_path: string;
  created_at: string | null;
  jobs: { job_name: string | null } | null;
}

/**
 * Company documents: every file attached to this company's jobs (job_documents, scoped to the
 * company via its jobs). Read + download today. Upload parity, folders, and AML-document
 * auto-save on approval are tracked as a follow-up — they need document-storage schema/RLS changes
 * (document_folders is currently client-only) that shouldn't ship without live verification.
 */
export function CompanyDocumentsTab({ companyId }: Props) {
  const { organization } = useOrganization();

  const docs = useQuery({
    queryKey: ["company-documents", companyId, organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [] as CompanyDoc[];
      const { data, error } = await supabase
        .from("job_documents")
        .select("id, file_name, file_path, created_at, jobs!inner(job_name, company_id)")
        .eq("organization_id", organization.id)
        .eq("jobs.company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CompanyDoc[];
    },
    enabled: !!organization?.id && !!companyId,
  });

  const download = async (doc: CompanyDoc) => {
    const { data, error } = await supabase.storage
      .from("job-documents")
      .createSignedUrl(doc.file_path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Could not open document");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Documents</CardTitle>
        <CardDescription>Documents attached to this company's jobs</CardDescription>
      </CardHeader>
      <CardContent>
        {docs.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (docs.data?.length ?? 0) === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No documents yet</p>
            <p className="text-sm mt-1">Documents uploaded against this company's jobs appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(docs.data ?? []).map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.jobs?.job_name || "—"}
                      {doc.created_at && ` • ${format(new Date(doc.created_at), "dd MMM yyyy")}`}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => download(doc)}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
