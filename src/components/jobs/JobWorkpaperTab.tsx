import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, Lock, Edit, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

interface JobWorkpaperTabProps {
  jobId: string;
}

export function JobWorkpaperTab({ jobId }: JobWorkpaperTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});

  const { data: workpaper, isLoading } = useQuery({
    queryKey: ["job-workpaper", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workpaper_instances")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setFieldValues(data.field_values as Record<string, any>);
      }
      return data;
    },
  });

  const updateWorkpaperMutation = useMutation({
    mutationFn: async (updates: { field_values?: any; status?: string }) => {
      if (!workpaper) return;

      const { error } = await supabase
        .from("workpaper_instances")
        .update(updates)
        .eq("id", workpaper.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-workpaper", jobId] });
      toast({ title: "Workpaper updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update workpaper", variant: "destructive" });
    },
  });

  const finaliseWorkpaperMutation = useMutation({
    mutationFn: async () => {
      if (!workpaper) return;

      const { error } = await supabase
        .from("workpaper_instances")
        .update({
          status: "finalised",
          finalised_at: new Date().toISOString(),
        })
        .eq("id", workpaper.id);

      if (error) throw error;

      // Auto-create filing
      const { error: filingError } = await supabase
        .from("filings")
        .insert({
          organization_id: workpaper.organization_id,
          job_id: workpaper.job_id,
          workpaper_instance_id: workpaper.id,
          client_id: workpaper.client_id,
          company_id: workpaper.company_id,
          filing_type: workpaper.service_type,
          filing_body: "HMRC",
          period_start: workpaper.period_start,
          period_end: workpaper.period_end,
          tax_year: workpaper.period_label,
          filing_data: workpaper.field_values,
        });

      if (filingError) throw filingError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-workpaper", jobId] });
      queryClient.invalidateQueries({ queryKey: ["job-filing", jobId] });
      toast({ title: "Workpaper finalised and filing created" });
    },
  });

  const handleFieldUpdate = (fieldName: string, value: any) => {
    const newValues = { ...fieldValues, [fieldName]: value };
    setFieldValues(newValues);
  };

  const handleSaveField = (fieldName: string) => {
    updateWorkpaperMutation.mutate({ field_values: fieldValues });
    setEditingField(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "finalised":
        return "bg-green-500";
      case "ready_for_review":
        return "bg-blue-500";
      case "in_progress":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading workpaper...</div>;
  }

  if (!workpaper) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Workpaper will be created automatically when questionnaire is submitted
          </p>
        </CardContent>
      </Card>
    );
  }

  const isLocked = workpaper.status === "finalised";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{workpaper.name}</h3>
          <p className="text-sm text-muted-foreground">
            {workpaper.period_label} • Created {format(new Date(workpaper.created_at), "d MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={getStatusColor(workpaper.status)}>
            {workpaper.status}
          </Badge>
          {!isLocked && workpaper.status !== "finalised" && (
            <Button
              onClick={() => finaliseWorkpaperMutation.mutate()}
              disabled={finaliseWorkpaperMutation.isPending}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Finalise & Create Filing
            </Button>
          )}
          {isLocked && (
            <Badge variant="outline">
              <Lock className="mr-1 h-3 w-3" />
              Locked
            </Badge>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workpaper Fields</CardTitle>
          <CardDescription>
            Review and edit values from questionnaire responses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(fieldValues).map(([fieldName, value]) => (
              <div key={fieldName} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <Label className="text-sm font-medium capitalize">
                    {fieldName.replace(/_/g, " ")}
                  </Label>
                  {!isLocked && editingField !== fieldName && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingField(fieldName)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {editingField === fieldName ? (
                  <div className="space-y-2">
                    <Input
                      value={value}
                      onChange={(e) => handleFieldUpdate(fieldName, e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSaveField(fieldName)}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingField(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{value || "Not provided"}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {workpaper.finalised_at && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              Finalised on {format(new Date(workpaper.finalised_at), "d MMM yyyy HH:mm")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
