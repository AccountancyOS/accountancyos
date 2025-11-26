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
  const [status, setStatus] = useState("not_started");
  const [priority, setPriority] = useState("normal");
  const [filingDeadline, setFilingDeadline] = useState("");

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
      
      const { error } = await supabase.from("jobs").insert({
        organization_id: organization.id,
        job_name: jobName,
        [isCompany ? "company_id" : "client_id"]: clientId,
        service_type: serviceType,
        status,
        priority,
        filing_deadline: filingDeadline || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Job created successfully");
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to create job");
      console.error(error);
    },
  });

  const resetForm = () => {
    setJobName("");
    setClientId("");
    setServiceType("");
    setStatus("not_started");
    setPriority("normal");
    setFilingDeadline("");
  };

  const allEntities = [
    ...(clients?.map(c => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, type: "client" })) || []),
    ...(companies?.map(c => ({ id: c.id, name: c.company_name, type: "company" })) || []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Job</DialogTitle>
          <DialogDescription>
            Create a new job for a client or company
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="jobName">Job Name</Label>
            <Input
              id="jobName"
              placeholder="e.g., FY24 Accounts Preparation"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client">Client / Company</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger id="client">
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="serviceType">Service Type</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger id="serviceType">
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
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="waiting_on_client">Waiting on Client</SelectItem>
                  <SelectItem value="with_reviewer">With Reviewer</SelectItem>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createJobMutation.mutate()}
            disabled={!jobName || !clientId || !serviceType || createJobMutation.isPending}
          >
            Create Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
