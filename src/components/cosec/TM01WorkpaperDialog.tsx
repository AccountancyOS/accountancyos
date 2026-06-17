import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { CalendarIcon, Loader2, UserMinus, FileText, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createResolutionFiling } from "@/lib/cosec-filing-service";

interface TM01WorkpaperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  organizationId: string;
  jobId?: string;
}

export function TM01WorkpaperDialog({
  open,
  onOpenChange,
  companyId,
  organizationId,
  jobId,
}: TM01WorkpaperDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"form" | "review" | "complete">("form");
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>("");
  const [resignationDate, setResignationDate] = useState<Date>(new Date());

  // Fetch active officers
  const { data: officers, isLoading } = useQuery({
    queryKey: ["company-officers-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_officers")
        .select(`
          *,
          person:company_persons(*)
        `)
        .eq("company_id", companyId)
        .is("resigned_at", null);
      
      if (error) throw error;
      return data || [];
    },
  });

  const selectedOfficer = officers?.find(o => o.id === selectedOfficerId);

  // Create filing mutation
  const createFilingMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOfficer) throw new Error("No officer selected");

      // Update officer resignation date
      const { error: updateError } = await supabase
        .from("company_officers")
        .update({ resigned_at: resignationDate.toISOString().split("T")[0] })
        .eq("id", selectedOfficerId);

      if (updateError) throw updateError;

      // Create the filing
      const result = await createResolutionFiling({
        companyId,
        organizationId,
        jobId,
        filingType: "TM01",
        relatedData: {
          officer_id: selectedOfficerId,
          person_id: selectedOfficer.person_id,
          name: `${selectedOfficer.person?.first_name} ${selectedOfficer.person?.last_name}`,
          role: selectedOfficer.role,
          appointed_on: selectedOfficer.appointed_at,
          resigned_on: resignationDate.toISOString().split("T")[0],
        },
        discrepancyMessage: `Resignation of ${selectedOfficer.person?.first_name} ${selectedOfficer.person?.last_name} as ${selectedOfficer.role}`,
      });

      if (!result.success) throw new Error(result.error);

      // Update job if linked
      if (jobId) {
        await supabase
          .from("jobs")
          // chk_jobs_status: see SH01WorkpaperDialog.
          .update({ status: "records_received" })
          .eq("id", jobId);
      }

      // Create register event
      await supabase
        .from("company_register_events")
        .insert({
          company_id: companyId,
          event_type: "officer_resigned",
          event_date: resignationDate.toISOString().split("T")[0],
          source: "manual",
          officer_id: selectedOfficerId,
          person_id: selectedOfficer.person_id,
          filing_id: result.filingId,
          details: {
            name: `${selectedOfficer.person?.first_name} ${selectedOfficer.person?.last_name}`,
            role: selectedOfficer.role,
          },
        });

      return result;
    },
    onSuccess: () => {
      setStep("complete");
      queryClient.invalidateQueries({ queryKey: ["company-officers", companyId] });
      queryClient.invalidateQueries({ queryKey: ["company-officers-active", companyId] });
      queryClient.invalidateQueries({ queryKey: ["cosec-jobs", companyId] });
      queryClient.invalidateQueries({ queryKey: ["register-events", companyId] });
      toast.success("Director termination filed");
    },
    onError: (error: any) => {
      toast.error("Failed to create filing", { description: error.message });
    },
  });

  const handleClose = () => {
    setStep("form");
    setSelectedOfficerId("");
    setResignationDate(new Date());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserMinus className="h-5 w-5" />
            TM01 - Terminate Director
          </DialogTitle>
          <DialogDescription>
            {step === "form" && "Select the director to terminate"}
            {step === "review" && "Review the termination details before filing"}
            {step === "complete" && "Filing has been created successfully"}
          </DialogDescription>
        </DialogHeader>

        {step === "form" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Officer *</Label>
              <Select value={selectedOfficerId} onValueChange={setSelectedOfficerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an officer" />
                </SelectTrigger>
                <SelectContent>
                  {isLoading ? (
                    <SelectItem value="" disabled>Loading...</SelectItem>
                  ) : officers && officers.length > 0 ? (
                    officers.map((officer) => (
                      <SelectItem key={officer.id} value={officer.id}>
                        {officer.person?.first_name} {officer.person?.last_name} ({officer.role})
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="" disabled>No active officers</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Resignation Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(resignationDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={resignationDate}
                    onSelect={(date) => date && setResignationDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {selectedOfficer && (
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">Selected Officer Details</p>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span>{selectedOfficer.person?.first_name} {selectedOfficer.person?.last_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Role</span>
                    <span className="capitalize">{selectedOfficer.role}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Appointed</span>
                    <span>{format(new Date(selectedOfficer.appointed_at), "d MMM yyyy")}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "review" && selectedOfficer && (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">
                  {selectedOfficer.person?.first_name} {selectedOfficer.person?.last_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Role</span>
                <span className="font-medium capitalize">{selectedOfficer.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Appointed</span>
                <span className="font-medium">
                  {format(new Date(selectedOfficer.appointed_at), "d MMM yyyy")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resignation Date</span>
                <span className="font-medium">{format(resignationDate, "d MMM yyyy")}</span>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                This will mark the officer as resigned and create a TM01 filing for submission to Companies House.
              </p>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="py-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Filing Created</h3>
            <p className="text-muted-foreground mt-1">
              The TM01 filing has been created. Submit to Companies House when ready.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === "form" && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => setStep("review")} disabled={!selectedOfficerId}>
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
