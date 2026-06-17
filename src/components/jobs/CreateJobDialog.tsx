import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FormFieldError } from "@/components/ui/form-field-error";
import { jobSchema, validateForm } from "@/lib/validation-schemas";
import { JOB_STATUSES } from "@/lib/workflow-constants";
import { formatStatus } from "@/lib/format-utils";

interface CreateJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateJobDialog({ open, onOpenChange }: CreateJobDialogProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [jobName, setJobName] = useState("");
  const [clientId, setClientId] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [status, setStatus] = useState<(typeof JOB_STATUSES)[number]>("blank");
  const [priority, setPriority] = useState("normal");
  const [filingDeadline, setFilingDeadline] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: clients } = useQuery({
    queryKey: ["clients", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, email")
        .eq("organization_id", organization.id)
        .order("first_name");
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const { data: companies } = useQuery({
    queryKey: ["companies", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("companies")
        .select("id, company_name, email")
        .eq("organization_id", organization.id)
        .order("company_name");
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const createJobMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");

      const isCompany = companies?.some(c => c.id === clientId);

      // Validate form data
      const formData = {
        job_name: jobName.trim(),
        [isCompany ? "company_id" : "client_id"]: clientId,
        service_type: serviceType,
        status,
        priority,
        filing_deadline: filingDeadline || undefined,
      };

      const validation = validateForm(jobSchema, formData);
      if (!validation.success) {
        setErrors(validation.errors || {});
        throw new Error("Please check the form for errors");
      }

      const { data: jobRow, error } = await supabase.from("jobs").insert({
        organization_id: organization.id,
        job_name: jobName.trim(),
        [isCompany ? "company_id" : "client_id"]: clientId,
        service_type: serviceType,
        status,
        priority,
        filing_deadline: filingDeadline || null,
      }).select("id").single();

      if (error) throw error;

      // Best-effort: clone workpaper template (if any default exists for this job type)
      if (jobRow?.id) {
        try {
          const { data: tmpl } = await supabase
            .from("workpaper_templates")
            .select("id, file_path")
            .eq("job_type", serviceType)
            .eq("is_default", true)
            .eq("is_active", true)
            .or(`organization_id.is.null,organization_id.eq.${organization.id}`)
            .order("organization_id", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
          if (tmpl?.id && tmpl.file_path) {
            await supabase.functions.invoke("clone-workpaper-template", {
              body: { template_id: tmpl.id, job_id: jobRow.id },
            });
          }
        } catch (e) {
          // non-blocking
          console.warn("Workpaper auto-clone failed:", e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Job created successfully");
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      if (error.message !== "Please check the form for errors") {
        toast.error("Failed to create job", { description: error.message });
      }
    },
  });

  const resetForm = () => {
    setJobName("");
    setClientId("");
    setServiceType("");
    setStatus("blank");
    setPriority("normal");
    setFilingDeadline("");
    setErrors({});
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      setErrors({});
    }
  };

  const allEntities = [
    ...(clients?.map(c => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, type: "client" })) || []),
    ...(companies?.map(c => ({ id: c.id, name: c.company_name, type: "company" })) || []),
  ];

  const handleSubmit = () => {
    setErrors({});
    
    // Pre-validate required fields
    const newErrors: Record<string, string> = {};
    if (!jobName.trim()) {
      newErrors.job_name = "Job name is required";
    } else if (jobName.trim().length > 200) {
      newErrors.job_name = "Job name must be less than 200 characters";
    }
    if (!clientId) {
      newErrors.client_id = "Please select a client or company";
    }
    if (!serviceType) {
      newErrors.service_type = "Service type is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error("Please check the form for errors");
      return;
    }

    createJobMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Job</DialogTitle>
          <DialogDescription>
            Create a new job for a client or company
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="jobName">Job Name *</Label>
            <Input
              id="jobName"
              placeholder="e.g., FY24 Accounts Preparation"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              className={errors.job_name ? "border-destructive" : ""}
              maxLength={200}
            />
            <FormFieldError error={errors.job_name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client">Client / Company *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger id="client" className={errors.client_id ? "border-destructive" : ""}>
                <SelectValue placeholder="Select client or company" />
              </SelectTrigger>
              <SelectContent>
                {allEntities.map((entity) => (
                  <SelectItem key={entity.id} value={entity.id}>
                    {entity.name} ({entity.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormFieldError error={errors.client_id} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="serviceType">Service Type *</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger id="serviceType" className={errors.service_type ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Accounts">Accounts</SelectItem>
                  <SelectItem value="CT600">Corporation Tax</SelectItem>
                  <SelectItem value="SA">Self Assessment</SelectItem>
                  <SelectItem value="VAT">VAT</SelectItem>
                  <SelectItem value="Bookkeeping">Bookkeeping</SelectItem>
                  <SelectItem value="Payroll">Payroll</SelectItem>
                  <SelectItem value="Advisory">Advisory</SelectItem>
                  <SelectItem value="Company Sec">Company Sec</SelectItem>
                </SelectContent>
              </Select>
              <FormFieldError error={errors.service_type} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filingDeadline">Filing Deadline</Label>
              <Input
                id="filingDeadline"
                type="date"
                value={filingDeadline}
                onChange={(e) => setFilingDeadline(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as (typeof JOB_STATUSES)[number])}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {formatStatus(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createJobMutation.isPending}
          >
            {createJobMutation.isPending ? "Creating..." : "Create Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
