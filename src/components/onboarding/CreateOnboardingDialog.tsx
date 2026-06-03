import { useState } from "react";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
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
    if (!organization?.id) {
      toast({ title: "No organization selected", variant: "destructive" });
      return;
    }

    // Manual mode validation (no lead picked)
    if (!leadId) {
      if (applicationType === "individual" && (!firstName.trim() || !lastName.trim() || !email.trim())) {
        toast({ title: "Missing details", description: "First name, last name and email are required.", variant: "destructive" });
        return;
      }
      if (applicationType === "company" && (!companyName.trim() || !email.trim())) {
        toast({ title: "Missing details", description: "Company name and email are required.", variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);

    try {
      let lead: { first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null = null;
      if (leadId) {
        const { data, error: leadError } = await supabase
          .from("leads")
          .select("first_name, last_name, email, phone")
          .eq("id", leadId)
          .single();
        if (leadError) throw leadError;
        lead = data;
      }

      const payload = {
        organization_id: organization.id,
        lead_id: leadId || null,
        application_type: applicationType,
        status: "in_progress" as const,
        first_name: applicationType === "individual" ? (lead?.first_name ?? (firstName.trim() || null)) : null,
        last_name: applicationType === "individual" ? (lead?.last_name ?? (lastName.trim() || null)) : null,
        company_name: applicationType === "company" ? (companyName.trim() || (lead ? `${lead.first_name ?? ""} ${lead.last_name ?? ""} Ltd`.trim() : null)) : null,
        company_number: applicationType === "company" ? (companyNumber.trim() || null) : null,
        email: lead?.email ?? (email.trim() || null),
        phone: lead?.phone ?? null,
      };

      const { data: application, error: appError } = await supabase
        .from("onboarding_applications")
        .insert(payload)
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
        description: error?.message || error?.details || "Unknown error",
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
            <Label htmlFor="lead">Select Lead (Optional)</Label>
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
              Only leads marked as "Won" in CRM are listed. Leave blank to enter details manually.
            </p>
          </div>

          {!leadId && applicationType === "individual" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input id="first_name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input id="last_name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          )}

          {!leadId && applicationType === "company" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="company_name">Company Name *</Label>
                <Input id="company_name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_number">Company Number</Label>
                <Input id="company_number" value={companyNumber} onChange={(e) => setCompanyNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Contact Email *</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
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
