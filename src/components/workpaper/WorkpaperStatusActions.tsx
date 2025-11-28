/**
 * Workpaper Status Actions Component
 * Provides status action buttons: Mark as In Review, Finalise, Reopen
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Lock,
  Unlock,
  CheckCircle,
  Eye,
  MoreHorizontal,
  FileCheck,
  RotateCcw,
  Send,
} from "lucide-react";
import { format } from "date-fns";

interface WorkpaperStatusActionsProps {
  workpaperId: string;
  jobId: string;
  currentStatus: string;
  isLocked: boolean;
  preparedBy?: string;
  preparedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  finalisedBy?: string;
  finalisedAt?: string;
  onStatusChange?: () => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-gray-500" },
  in_progress: { label: "In Progress", color: "bg-yellow-500" },
  ready_for_review: { label: "Ready for Review", color: "bg-blue-500" },
  in_review: { label: "In Review", color: "bg-purple-500" },
  finalised: { label: "Finalised", color: "bg-green-500" },
};

export function WorkpaperStatusActions({
  workpaperId,
  jobId,
  currentStatus,
  isLocked,
  preparedBy,
  preparedAt,
  reviewedBy,
  reviewedAt,
  finalisedBy,
  finalisedAt,
  onStatusChange,
}: WorkpaperStatusActionsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      status,
      additionalFields,
    }: {
      status: string;
      additionalFields?: Record<string, any>;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const updates: Record<string, any> = {
        status,
        ...additionalFields,
      };

      // Set appropriate timestamps based on status
      if (status === "ready_for_review") {
        updates.prepared_by = updates.prepared_by || user?.id;
        updates.prepared_at = updates.prepared_at || new Date().toISOString();
      } else if (status === "in_review") {
        updates.reviewed_by = user?.id;
        updates.reviewed_at = new Date().toISOString();
      } else if (status === "finalised") {
        updates.finalised_by = user?.id;
        updates.finalised_at = new Date().toISOString();
        updates.locked = true;
      } else if (status === "draft" || status === "in_progress") {
        // Reopening - unlock but preserve history
        updates.locked = false;
      }

      const { error } = await supabase
        .from("workpaper_instances")
        .update(updates)
        .eq("id", workpaperId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-workpaper", jobId] });
      queryClient.invalidateQueries({ queryKey: ["workpapers"] });
      onStatusChange?.();
      toast({ title: "Workpaper status updated" });
    },
    onError: (error) => {
      toast({
        title: "Failed to update status",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const finaliseAndCreateFilingMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();

      // First, get the workpaper data
      const { data: workpaper, error: fetchError } = await supabase
        .from("workpaper_instances")
        .select("*")
        .eq("id", workpaperId)
        .single();

      if (fetchError) throw fetchError;

      // Update workpaper status
      const { error: updateError } = await supabase
        .from("workpaper_instances")
        .update({
          status: "finalised",
          finalised_by: user?.id,
          finalised_at: new Date().toISOString(),
          locked: true,
        })
        .eq("id", workpaperId);

      if (updateError) throw updateError;

      // Create filing record
      const { error: filingError } = await supabase.from("filings").insert({
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
        status: "not_started",
      });

      if (filingError) throw filingError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-workpaper", jobId] });
      queryClient.invalidateQueries({ queryKey: ["job-filing", jobId] });
      queryClient.invalidateQueries({ queryKey: ["workpapers"] });
      onStatusChange?.();
      toast({ title: "Workpaper finalised and filing created" });
    },
    onError: (error) => {
      toast({
        title: "Failed to finalise",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const config = statusConfig[currentStatus] || statusConfig.draft;

  return (
    <div className="flex items-center gap-2">
      {/* Status Badge */}
      <Badge className={config.color}>{config.label}</Badge>

      {/* Lock indicator */}
      {isLocked && (
        <Badge variant="outline" className="gap-1">
          <Lock className="h-3 w-3" />
          Locked
        </Badge>
      )}

      {/* Primary action buttons based on current status */}
      {currentStatus === "draft" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            updateStatusMutation.mutate({ status: "in_progress" })
          }
          disabled={updateStatusMutation.isPending}
        >
          Start Working
        </Button>
      )}

      {currentStatus === "in_progress" && (
        <Button
          size="sm"
          onClick={() =>
            updateStatusMutation.mutate({ status: "ready_for_review" })
          }
          disabled={updateStatusMutation.isPending}
        >
          <Eye className="mr-2 h-4 w-4" />
          Mark Ready for Review
        </Button>
      )}

      {currentStatus === "ready_for_review" && (
        <Button
          size="sm"
          onClick={() =>
            updateStatusMutation.mutate({ status: "in_review" })
          }
          disabled={updateStatusMutation.isPending}
        >
          <FileCheck className="mr-2 h-4 w-4" />
          Start Review
        </Button>
      )}

      {currentStatus === "in_review" && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              disabled={finaliseAndCreateFilingMutation.isPending}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Finalise & Create Filing
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Finalise Workpaper?</AlertDialogTitle>
              <AlertDialogDescription>
                This will lock the workpaper and create a filing record. The
                workpaper cannot be edited after finalisation without reopening.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => finaliseAndCreateFilingMutation.mutate()}
              >
                Finalise
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* More actions dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Reopen action - only for finalised workpapers */}
          {currentStatus === "finalised" && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reopen Workpaper
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reopen Workpaper?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will unlock the workpaper and set it back to "In
                      Review" status. Any linked filing will need to be
                      regenerated after changes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        updateStatusMutation.mutate({
                          status: "in_review",
                          additionalFields: { locked: false },
                        })
                      }
                    >
                      Reopen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Send back actions */}
          {currentStatus === "in_review" && (
            <DropdownMenuItem
              onClick={() =>
                updateStatusMutation.mutate({ status: "in_progress" })
              }
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Send Back (needs changes)
            </DropdownMenuItem>
          )}

          {currentStatus === "ready_for_review" && (
            <DropdownMenuItem
              onClick={() =>
                updateStatusMutation.mutate({ status: "in_progress" })
              }
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Back to In Progress
            </DropdownMenuItem>
          )}

          {/* Status info */}
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {preparedAt && (
              <p>Prepared: {format(new Date(preparedAt), "d MMM yyyy HH:mm")}</p>
            )}
            {reviewedAt && (
              <p>Reviewed: {format(new Date(reviewedAt), "d MMM yyyy HH:mm")}</p>
            )}
            {finalisedAt && (
              <p>
                Finalised: {format(new Date(finalisedAt), "d MMM yyyy HH:mm")}
              </p>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
