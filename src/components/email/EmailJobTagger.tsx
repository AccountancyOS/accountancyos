import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Briefcase, Plus } from "lucide-react";
import { toast } from "sonner";

interface EmailJobTaggerProps {
  emailId: string;
  clientId?: string | null;
  companyId?: string | null;
  currentJobId?: string | null;
  emailSubject?: string | null;
  onTagged?: () => void;
}

export function EmailJobTagger({
  emailId,
  clientId,
  companyId,
  currentJobId,
  emailSubject,
  onTagged,
}: EmailJobTaggerProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newJobName, setNewJobName] = useState(emailSubject || "");

  // Fetch jobs for this client/company
  const { data: jobs } = useQuery({
    queryKey: ["jobs-for-email", organization?.id, clientId, companyId],
    queryFn: async () => {
      if (!organization?.id || (!clientId && !companyId)) return [];

      let query = supabase
        .from("jobs")
        .select("id, job_name, service_type, status")
        .eq("organization_id", organization.id)
        .neq("status", "completed")
        .order("created_at", { ascending: false });

      if (clientId) {
        query = query.eq("client_id", clientId);
      }
      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id && (!!clientId || !!companyId),
  });

  // Mutation to tag email to job
  const tagJobMutation = useMutation({
    mutationFn: async (jobId: string | null) => {
      const { error } = await supabase
        .from("email_messages")
        .update({ job_id: jobId })
        .eq("id", emailId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-messages"] });
      toast.success("Email tagged to job");
      onTagged?.();
    },
    onError: () => {
      toast.error("Failed to tag email");
    },
  });

  // Mutation to create new job from email
  const createJobMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");

      const { data, error } = await supabase
        .from("jobs")
        .insert([{
          organization_id: organization.id,
          client_id: clientId || undefined,
          company_id: companyId || undefined,
          job_name: newJobName,
          service_type: "General",
          status: "not_started",
          priority: "medium",
        }])
        .select("id")
        .single();

      if (error) throw error;

      // Tag the email to the new job
      await supabase
        .from("email_messages")
        .update({ job_id: data.id })
        .eq("id", emailId);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["email-messages"] });
      setShowCreateDialog(false);
      toast.success("Job created and email tagged");
      onTagged?.();
    },
    onError: () => {
      toast.error("Failed to create job");
    },
  });

  const handleJobSelect = (value: string) => {
    if (value === "none") {
      tagJobMutation.mutate(null);
    } else if (value === "create") {
      setNewJobName(emailSubject || "");
      setShowCreateDialog(true);
    } else {
      tagJobMutation.mutate(value);
    }
  };

  if (!clientId && !companyId) {
    return (
      <p className="text-sm text-muted-foreground">
        Match email to a client/company first to tag to a job
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-muted-foreground" />
        <Select
          value={currentJobId || "none"}
          onValueChange={handleJobSelect}
        >
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Tag to job..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No job</SelectItem>
            {jobs?.map((job) => (
              <SelectItem key={job.id} value={job.id}>
                {job.job_name} ({job.service_type || "General"})
              </SelectItem>
            ))}
            <SelectItem value="create">
              <span className="flex items-center gap-2">
                <Plus className="h-3 w-3" />
                Create new job...
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Job from Email</DialogTitle>
            <DialogDescription>
              Create a new job and link this email to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="jobName">Job Name</Label>
              <Input
                id="jobName"
                value={newJobName}
                onChange={(e) => setNewJobName(e.target.value)}
                placeholder="Enter job name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createJobMutation.mutate()}
              disabled={!newJobName.trim() || createJobMutation.isPending}
            >
              Create Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
