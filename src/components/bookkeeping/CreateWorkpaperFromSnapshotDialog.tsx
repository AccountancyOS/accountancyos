import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createWorkpaperFromSnapshot, UK_WORKPAPER_CATEGORIES } from "@/lib/workpaper-from-tb";
import { formatServiceType } from "@/lib/format-utils";
import { OPEN_JOB_STATUSES } from "@/lib/workflow-constants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileSpreadsheet, ArrowRight, Building2, User } from "lucide-react";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { format } from "date-fns";

interface CreateWorkpaperFromSnapshotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: {
    id: string;
    period_start: string;
    period_end: string;
    client_id: string | null;
    company_id: string | null;
    balances: any[];
    metadata: any;
  };
  entityName: string;
  entityType: "client" | "company";
}

const WORKPAPER_TYPES = [
  { value: "company_accounts", label: "Company Accounts", forCompany: true },
  { value: "ct600", label: "CT600 Tax Computation", forCompany: true },
  { value: "self_assessment", label: "Self Assessment", forCompany: false },
  { value: "vat_return", label: "VAT Return", forCompany: true },
];

export function CreateWorkpaperFromSnapshotDialog({
  open,
  onOpenChange,
  snapshot,
  entityName,
  entityType,
}: CreateWorkpaperFromSnapshotDialogProps) {
  const queryClient = useQueryClient();
  const [workpaperType, setWorkpaperType] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  // Fetch available jobs for this entity
  const { data: jobs } = useQuery({
    queryKey: ["entity-jobs", snapshot.client_id, snapshot.company_id],
    queryFn: async () => {
      let query = supabase
        .from("jobs")
        .select("id, job_name, service_type, period_label, status")
        .in("status", [...OPEN_JOB_STATUSES]);

      if (snapshot.company_id) {
        query = query.eq("company_id", snapshot.company_id);
      } else if (snapshot.client_id) {
        query = query.eq("client_id", snapshot.client_id);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const createWorkpaperMutation = useMutation({
    mutationFn: async () => {
      if (!workpaperType) throw new Error("Please select a workpaper type");

      const result = await createWorkpaperFromSnapshot(
        snapshot.id,
        workpaperType as keyof typeof UK_WORKPAPER_CATEGORIES,
        {
          jobId: selectedJobId || undefined,
          name: customName || undefined,
        }
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to create workpaper");
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workpapers"] });
      queryClient.invalidateQueries({ queryKey: ["trial-balance-snapshots"] });
      toast.success("Workpaper created successfully", {
        description: "TB data has been mapped to workpaper categories",
      });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error("Failed to create workpaper", { description: error.message });
    },
  });

  const resetForm = () => {
    setWorkpaperType("");
    setCustomName("");
    setSelectedJobId("");
  };

  const filteredWorkpaperTypes = WORKPAPER_TYPES.filter(type => {
    if (entityType === "company") return type.forCompany;
    return !type.forCompany || type.value === "vat_return"; // Sole traders can have VAT
  });

  const selectedTypeConfig = workpaperType 
    ? UK_WORKPAPER_CATEGORIES[workpaperType as keyof typeof UK_WORKPAPER_CATEGORIES]
    : null;

  const categoryCount = selectedTypeConfig ? Object.keys(selectedTypeConfig).length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Create Workpaper from Snapshot
          </DialogTitle>
          <DialogDescription>
            Map trial balance data to workpaper categories for {entityName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Snapshot info */}
          <div className="bg-muted rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              {entityType === "company" ? (
                <Building2 className="h-4 w-4 text-muted-foreground" />
              ) : (
                <User className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-medium">{entityName}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Period</span>
                <p className="font-medium">
                  {format(new Date(snapshot.period_start), "d MMM yyyy")} -{" "}
                  {format(new Date(snapshot.period_end), "d MMM yyyy")}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Accounts</span>
                <p className="font-medium">{snapshot.balances?.length || 0}</p>
              </div>
            </div>
          </div>

          {/* Workpaper type selection */}
          <div className="space-y-2">
            <Label htmlFor="workpaper-type">Workpaper Type *</Label>
            <Select value={workpaperType} onValueChange={setWorkpaperType}>
              <SelectTrigger id="workpaper-type">
                <SelectValue placeholder="Select workpaper type" />
              </SelectTrigger>
              <SelectContent>
                {filteredWorkpaperTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTypeConfig && (
              <p className="text-xs text-muted-foreground">
                Will create {categoryCount} workpaper categories with mapped TB data
              </p>
            )}
          </div>

          {/* Optional job link */}
          <div className="space-y-2">
            <Label htmlFor="job">Link to Job (optional)</Label>
            <Select value={selectedJobId} onValueChange={setSelectedJobId}>
              <SelectTrigger id="job">
                <SelectValue placeholder="No job selected" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No job</SelectItem>
                {jobs?.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.job_name} ({job.period_label || formatServiceType(job.service_type)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom name */}
          <div className="space-y-2">
            <Label htmlFor="name">Custom Name (optional)</Label>
            <Input
              id="name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Auto-generated if left blank"
            />
          </div>

          {/* Preview */}
          {workpaperType && (
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2 text-sm">Categories to be created:</h4>
              <div className="flex flex-wrap gap-1">
                {selectedTypeConfig && Object.entries(selectedTypeConfig).slice(0, 8).map(([key, config]) => (
                  <span
                    key={key}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-primary/10 text-primary"
                  >
                    {(config as any).label}
                  </span>
                ))}
                {categoryCount > 8 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-muted text-muted-foreground">
                    +{categoryCount - 8} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createWorkpaperMutation.mutate()}
            disabled={!workpaperType || createWorkpaperMutation.isPending}
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            {createWorkpaperMutation.isPending ? "Creating..." : "Create Workpaper"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
