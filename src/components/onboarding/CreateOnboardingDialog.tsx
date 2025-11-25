import { useState } from "react";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface CreateOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const CreateOnboardingDialog = ({
  open,
  onOpenChange,
  onSuccess,
}: CreateOnboardingDialogProps) => {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [applicationType, setApplicationType] = useState<"individual" | "company">("individual");
  const [leadId, setLeadId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: leads } = useQuery({
    queryKey: ["leads", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("id, first_name, last_name, email")
        .eq("organization_id", organization.id)
        .eq("pipeline_stage", "won")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id && open,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Get lead details
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single();

      if (leadError) throw leadError;

      // Create onboarding application
      const { data: application, error: appError } = await supabase
        .from("onboarding_applications")
        .insert({
          organization_id: organization!.id,
          lead_id: leadId,
          application_type: applicationType,
          first_name: applicationType === "individual" ? lead.first_name : null,
          last_name: applicationType === "individual" ? lead.last_name : null,
          company_name: applicationType === "company" ? `${lead.first_name} ${lead.last_name} Ltd` : null,
          email: lead.email,
          phone: lead.phone,
          status: "pending",
        })
        .select()
        .single();

      if (appError) throw appError;

      toast({
        title: "Application created",
        description: "Onboarding application has been created successfully.",
      });

      onOpenChange(false);
      onSuccess();
      navigate(`/onboarding/${application.id}`);
    } catch (error: any) {
      toast({
        title: "Error creating application",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Start Onboarding
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start Client Onboarding</DialogTitle>
          <DialogDescription>
            Create a new onboarding application from a won lead
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Application Type</Label>
            <RadioGroup
              value={applicationType}
              onValueChange={(value) => setApplicationType(value as "individual" | "company")}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="individual" id="individual" />
                <Label htmlFor="individual" className="font-normal cursor-pointer">
                  Individual Client
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="company" id="company" />
                <Label htmlFor="company" className="font-normal cursor-pointer">
                  Company
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lead">Select Lead *</Label>
            <Select value={leadId} onValueChange={setLeadId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a won lead..." />
              </SelectTrigger>
              <SelectContent>
                {leads?.map((lead) => (
                  <SelectItem key={lead.id} value={lead.id}>
                    {lead.first_name} {lead.last_name} ({lead.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Only leads marked as "Won" in CRM are available
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!leadId || submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Application"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateOnboardingDialog;
