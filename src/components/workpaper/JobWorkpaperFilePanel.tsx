import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Upload, FileSpreadsheet, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { listWorkpaperTemplates } from "@/lib/workpaper-template-service";

interface Props {
  jobId: string;
  jobServiceType?: string | null;
}

export function JobWorkpaperFilePanel({ jobId, jobServiceType }: Props) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  const { data: instance, isLoading } = useQuery({
    queryKey: ["job-workpaper-file", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_workpaper_instances")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["workpaper-templates-for-job", organization?.id, jobServiceType],
    queryFn: () => listWorkpaperTemplates(organization!.id, jobServiceType ?? undefined),
    enabled: picking && !!organization?.id,
  });

  const cloneMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error } = await supabase.functions.invoke("clone-workpaper-template", {
        body: { template_id: templateId, job_id: jobId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-workpaper-file", jobId] });
      toast.success("Workpaper created from template");
      setPicking(false);
      setSelectedTemplate("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!instance) throw new Error("No workpaper instance");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", bookSheets: true });
      const path = (instance as any).file_path
        ?? `instances/${instance.organization_id}/${jobId}/${instance.id}.xlsx`;
      const { error: upErr } = await supabase.storage
        .from("workpaper-files")
        .upload(path, file, {
          upsert: true,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      if (upErr) throw upErr;
      const user = (await supabase.auth.getUser()).data.user;
      const { error: updErr } = await supabase
        .from("job_workpaper_instances")
        .update({
          file_path: path,
          file_name: file.name,
          file_size_bytes: file.size,
          file_version: ((instance as any).file_version ?? 1) + 1,
          last_uploaded_at: new Date().toISOString(),
          last_uploaded_by: user?.id ?? null,
          instance_schema_json: { sheet_names: wb.SheetNames ?? [] },
        })
        .eq("id", instance.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-workpaper-file", jobId] });
      toast.success("New version uploaded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function downloadFile() {
    const path = (instance as any)?.file_path;
    if (!path) return toast.error("No file attached");
    const { data, error } = await supabase.storage
      .from("workpaper-files")
      .createSignedUrl(path, 60);
    if (error || !data) return toast.error(error?.message ?? "Download failed");
    window.open(data.signedUrl, "_blank");
    await supabase
      .from("job_workpaper_instances")
      .update({ last_opened_at: new Date().toISOString() })
      .eq("id", instance!.id);
  }

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  // No instance yet — offer to create from a template
  if (!instance || !(instance as any).file_path) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Excel Workpaper</CardTitle>
          <CardDescription>
            Create a workpaper from a template, or upload your own Excel file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!picking ? (
            <div className="text-center py-6 border border-dashed rounded-md">
              <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                No workpaper has been created for this job yet.
              </p>
              <Button onClick={() => setPicking(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create From Template
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  {(templates ?? []).filter(t => t.file_path).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} {t.is_system ? "(System)" : ""}
                    </SelectItem>
                  ))}
                  {(templates ?? []).filter(t => t.file_path).length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No Excel templates available for this job type.
                    </div>
                  )}
                </SelectContent>
              </Select>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setPicking(false)}>Cancel</Button>
                <Button
                  disabled={!selectedTemplate || cloneMutation.isPending}
                  onClick={() => cloneMutation.mutate(selectedTemplate)}
                >
                  {cloneMutation.isPending ? "Creating…" : "Create"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const sheetNames: string[] =
    ((instance as any).instance_schema_json?.sheet_names as string[] | undefined) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          {(instance as any).file_name ?? "Workpaper.xlsx"}
        </CardTitle>
        <CardDescription>
          Version {(instance as any).file_version ?? 1}
          {(instance as any).last_uploaded_at && (
            <> · Updated {format(new Date((instance as any).last_uploaded_at), "d MMM yyyy HH:mm")}</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sheetNames.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sheetNames.map((n) => (
              <Badge key={n} variant="secondary" className="text-xs">{n}</Badge>
            ))}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadMutation.mutate(f);
            e.target.value = "";
          }}
        />
        <div className="flex gap-2">
          <Button onClick={downloadFile}>
            <Download className="h-4 w-4 mr-2" />
            Open In Excel
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploadMutation.isPending ? "Uploading…" : "Upload New Version"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Download the file, edit in desktop Excel, then upload the new version here.
        </p>
      </CardContent>
    </Card>
  );
}