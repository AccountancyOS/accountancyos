import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon, Loader2, UserPlus, FileText, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createResolutionFiling } from "@/lib/cosec-filing-service";

interface AP01WorkpaperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  organizationId: string;
  jobId?: string;
}

export function AP01WorkpaperDialog({
  open,
  onOpenChange,
  companyId,
  organizationId,
  jobId,
}: AP01WorkpaperDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"form" | "review" | "complete">("form");
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: undefined as Date | undefined,
    nationality: "",
    occupation: "",
    appointedDate: new Date(),
    role: "director" as "director" | "secretary",
    serviceAddress: "",
    serviceCity: "",
    servicePostcode: "",
  });

  // Fetch existing persons for selection
  const { data: existingPersons } = useQuery({
    queryKey: ["company-persons", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_persons")
        .select("*")
        .eq("organization_id", organizationId);
      if (error) throw error;
      return data || [];
    },
  });

  // Create filing mutation
  const createFilingMutation = useMutation({
    mutationFn: async () => {
      // First create the person
      const { data: person, error: personError } = await supabase
        .from("company_persons")
        .insert({
          organization_id: organizationId,
          first_name: formData.firstName,
          last_name: formData.lastName,
          date_of_birth: formData.dateOfBirth?.toISOString().split("T")[0],
          nationality: formData.nationality,
          occupation: formData.occupation,
          service_address_line_1: formData.serviceAddress,
          service_city: formData.serviceCity,
          service_postcode: formData.servicePostcode,
        })
        .select()
        .single();

      if (personError) throw personError;

      // Create the officer record
      const { data: officer, error: officerError } = await supabase
        .from("company_officers")
        .insert({
          company_id: companyId,
          person_id: person.id,
          role: formData.role,
          appointed_at: formData.appointedDate.toISOString().split("T")[0],
        })
        .select()
        .single();

      if (officerError) throw officerError;

      // Create the filing
      const result = await createResolutionFiling({
        companyId,
        organizationId,
        filingType: "AP01",
        relatedData: {
          person_id: person.id,
          officer_id: officer.id,
          name: `${formData.firstName} ${formData.lastName}`,
          role: formData.role,
          appointed_on: formData.appointedDate.toISOString().split("T")[0],
          date_of_birth: formData.dateOfBirth?.toISOString().split("T")[0],
          nationality: formData.nationality,
          occupation: formData.occupation,
          service_address: {
            address_line_1: formData.serviceAddress,
            locality: formData.serviceCity,
            postal_code: formData.servicePostcode,
          },
        },
        discrepancyMessage: `Appointment of ${formData.firstName} ${formData.lastName} as ${formData.role}`,
      });

      if (!result.success) throw new Error(result.error);

      // Update job if linked
      if (jobId) {
        await supabase
          .from("jobs")
          .update({ status: "in_progress" })
          .eq("id", jobId);
      }

      // Create register event
      await supabase
        .from("company_register_events")
        .insert({
          company_id: companyId,
          event_type: "officer_appointed",
          event_date: formData.appointedDate.toISOString().split("T")[0],
          source: "manual",
          officer_id: officer.id,
          person_id: person.id,
          filing_id: result.filingId,
          details: {
            name: `${formData.firstName} ${formData.lastName}`,
            role: formData.role,
          },
        });

      return result;
    },
    onSuccess: () => {
      setStep("complete");
      queryClient.invalidateQueries({ queryKey: ["company-officers", companyId] });
      queryClient.invalidateQueries({ queryKey: ["cosec-jobs", companyId] });
      queryClient.invalidateQueries({ queryKey: ["register-events", companyId] });
      toast.success("Director appointment filed");
    },
    onError: (error: any) => {
      toast.error("Failed to create filing", { description: error.message });
    },
  });

  const handleClose = () => {
    setStep("form");
    setFormData({
      firstName: "",
      lastName: "",
      dateOfBirth: undefined,
      nationality: "",
      occupation: "",
      appointedDate: new Date(),
      role: "director",
      serviceAddress: "",
      serviceCity: "",
      servicePostcode: "",
    });
    onOpenChange(false);
  };

  const isFormValid = 
    formData.firstName && 
    formData.lastName && 
    formData.dateOfBirth && 
    formData.nationality &&
    formData.occupation &&
    formData.appointedDate;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            AP01 - Appoint Director
          </DialogTitle>
          <DialogDescription>
            {step === "form" && "Enter the details of the new director"}
            {step === "review" && "Review the appointment details before filing"}
            {step === "complete" && "Filing has been created successfully"}
          </DialogDescription>
        </DialogHeader>

        {step === "form" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Smith"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date of Birth *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.dateOfBirth && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.dateOfBirth ? format(formData.dateOfBirth, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.dateOfBirth}
                      onSelect={(date) => setFormData({ ...formData, dateOfBirth: date })}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Appointment Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(formData.appointedDate, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.appointedDate}
                      onSelect={(date) => date && setFormData({ ...formData, appointedDate: date })}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nationality">Nationality *</Label>
                <Input
                  id="nationality"
                  value={formData.nationality}
                  onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                  placeholder="British"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="occupation">Occupation *</Label>
                <Input
                  id="occupation"
                  value={formData.occupation}
                  onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                  placeholder="Company Director"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="director">Director</SelectItem>
                  <SelectItem value="secretary">Secretary</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="serviceAddress">Service Address</Label>
              <Input
                id="serviceAddress"
                value={formData.serviceAddress}
                onChange={(e) => setFormData({ ...formData, serviceAddress: e.target.value })}
                placeholder="123 Business Street"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="serviceCity">City</Label>
                <Input
                  id="serviceCity"
                  value={formData.serviceCity}
                  onChange={(e) => setFormData({ ...formData, serviceCity: e.target.value })}
                  placeholder="London"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="servicePostcode">Postcode</Label>
                <Input
                  id="servicePostcode"
                  value={formData.servicePostcode}
                  onChange={(e) => setFormData({ ...formData, servicePostcode: e.target.value })}
                  placeholder="SW1A 1AA"
                />
              </div>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{formData.firstName} {formData.lastName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Role</span>
                <span className="font-medium capitalize">{formData.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date of Birth</span>
                <span className="font-medium">
                  {formData.dateOfBirth && format(formData.dateOfBirth, "d MMM yyyy")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Appointment Date</span>
                <span className="font-medium">{format(formData.appointedDate, "d MMM yyyy")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nationality</span>
                <span className="font-medium">{formData.nationality}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Occupation</span>
                <span className="font-medium">{formData.occupation}</span>
              </div>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="py-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Filing Created</h3>
            <p className="text-muted-foreground mt-1">
              The AP01 filing has been created. Submit to Companies House when ready.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === "form" && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => setStep("review")} disabled={!isFormValid}>
                <FileText className="h-4 w-4 mr-2" />
                Review
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => setStep("form")}>Back</Button>
              <Button 
                onClick={() => createFilingMutation.mutate()} 
                disabled={createFilingMutation.isPending}
              >
                {createFilingMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Filing
              </Button>
            </>
          )}
          {step === "complete" && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
