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
import { CalendarIcon, Loader2, Coins, FileText, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createResolutionFiling } from "@/lib/cosec-filing-service";

interface SH01WorkpaperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  organizationId: string;
  jobId?: string;
}

export function SH01WorkpaperDialog({
  open,
  onOpenChange,
  companyId,
  organizationId,
  jobId,
}: SH01WorkpaperDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"form" | "review" | "complete">("form");
  const [formData, setFormData] = useState({
    shareholderId: "",
    shareClassId: "",
    sharesAllotted: "",
    pricePerShare: "",
    allotmentDate: new Date(),
  });

  // Fetch share classes
  const { data: shareClasses } = useQuery({
    queryKey: ["company-share-classes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_share_classes")
        .select("*")
        .eq("company_id", companyId);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch existing shareholders
  const { data: shareholders } = useQuery({
    queryKey: ["company-shareholders-all", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_shareholders")
        .select(`
          *,
          person:company_persons(*),
          share_class:company_share_classes(*)
        `)
        .eq("company_id", companyId);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch persons for new shareholder selection
  const { data: persons } = useQuery({
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

  const selectedShareClass = shareClasses?.find(sc => sc.id === formData.shareClassId);
  const sharesNumber = parseInt(formData.sharesAllotted) || 0;
  const pricePerShare = parseFloat(formData.pricePerShare) || 0;
  const totalConsideration = sharesNumber * pricePerShare;

  // Create filing mutation
  const createFilingMutation = useMutation({
    mutationFn: async () => {
      if (!formData.shareholderId || !formData.shareClassId || !sharesNumber) {
        throw new Error("Missing required fields");
      }

      // Check if shareholder record exists for this person/share class combo
      let shareholderId = formData.shareholderId;
      const existingShareholder = shareholders?.find(
        sh => sh.person_id === formData.shareholderId && sh.share_class_id === formData.shareClassId
      );

      if (existingShareholder) {
        shareholderId = existingShareholder.id;
        // Update existing shareholder shares
        await supabase
          .from("company_shareholders")
          .update({ 
            shares_held: existingShareholder.shares_held + sharesNumber,
            as_at_date: formData.allotmentDate.toISOString().split("T")[0]
          })
          .eq("id", existingShareholder.id);
      } else {
        // Create new shareholder record
        const { data: newShareholder, error: shError } = await supabase
          .from("company_shareholders")
          .insert({
            company_id: companyId,
            person_id: formData.shareholderId,
            share_class_id: formData.shareClassId,
            shares_held: sharesNumber,
            as_at_date: formData.allotmentDate.toISOString().split("T")[0],
          })
          .select()
          .single();

        if (shError) throw shError;
        shareholderId = newShareholder.id;
      }

      // Create allotment record
      const { data: allotment, error: allotError } = await supabase
        .from("company_share_allotments")
        .insert({
          company_id: companyId,
          shareholder_id: shareholderId,
          share_class_id: formData.shareClassId,
          shares_allotted: sharesNumber,
          price_per_share: pricePerShare || null,
          total_consideration: totalConsideration || null,
          allotment_date: formData.allotmentDate.toISOString().split("T")[0],
        })
        .select()
        .single();

      if (allotError) throw allotError;

      // Update share class total
      if (selectedShareClass) {
        await supabase
          .from("company_share_classes")
          .update({ 
            total_shares_issued: selectedShareClass.total_shares_issued + sharesNumber 
          })
          .eq("id", formData.shareClassId);
      }

      // Get person details for filing
      const person = persons?.find(p => p.id === formData.shareholderId);

      // Create the filing
      const result = await createResolutionFiling({
        companyId,
        organizationId,
        filingType: "SH01",
        relatedData: {
          allotment_id: allotment.id,
          shareholder_id: shareholderId,
          person_id: formData.shareholderId,
          shareholder_name: person ? `${person.first_name} ${person.last_name}` : "Unknown",
          share_class: selectedShareClass?.class_name,
          shares_allotted: sharesNumber,
          price_per_share: pricePerShare,
          total_consideration: totalConsideration,
          allotment_date: formData.allotmentDate.toISOString().split("T")[0],
          statement_of_capital: {
            share_class: selectedShareClass?.class_name,
            nominal_value: selectedShareClass?.nominal_value,
            currency: selectedShareClass?.currency,
            total_issued_after: (selectedShareClass?.total_shares_issued || 0) + sharesNumber,
          },
        },
        discrepancyMessage: `Allotment of ${sharesNumber} ${selectedShareClass?.class_name} shares`,
      });

      if (!result.success) throw new Error(result.error);

      // Update job if linked
      if (jobId) {
        await supabase
          .from("jobs")
          // chk_jobs_status allows blank/records_requested/records_received/
          // accountant_queries/client_queries/accountant_review/client_review/
          // ready_to_file/completed. "in_progress" is not valid.
          .update({ status: "records_received" })
          .eq("id", jobId);
      }

      // Create register event
      await supabase
        .from("company_register_events")
        .insert({
          company_id: companyId,
          event_type: "shares_allotted",
          event_date: formData.allotmentDate.toISOString().split("T")[0],
          source: "manual",
          shareholder_id: shareholderId,
          allotment_id: allotment.id,
          filing_id: result.filingId,
          details: {
            shareholder_name: person ? `${person.first_name} ${person.last_name}` : "Unknown",
            share_class: selectedShareClass?.class_name,
            shares_allotted: sharesNumber,
            total_consideration: totalConsideration,
          },
        });

      return result;
    },
    onSuccess: () => {
      setStep("complete");
      queryClient.invalidateQueries({ queryKey: ["company-shareholders", companyId] });
      queryClient.invalidateQueries({ queryKey: ["company-shareholders-all", companyId] });
      queryClient.invalidateQueries({ queryKey: ["company-share-classes", companyId] });
      queryClient.invalidateQueries({ queryKey: ["cosec-jobs", companyId] });
      queryClient.invalidateQueries({ queryKey: ["register-events", companyId] });
      toast.success("Share allotment filed");
    },
    onError: (error: any) => {
      toast.error("Failed to create filing", { description: error.message });
    },
  });

  const handleClose = () => {
    setStep("form");
    setFormData({
      shareholderId: "",
      shareClassId: "",
      sharesAllotted: "",
      pricePerShare: "",
      allotmentDate: new Date(),
    });
    onOpenChange(false);
  };

  const isFormValid = 
    formData.shareholderId && 
    formData.shareClassId && 
    sharesNumber > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            SH01 - Allot Shares
          </DialogTitle>
          <DialogDescription>
            {step === "form" && "Enter the share allotment details"}
            {step === "review" && "Review the allotment before filing"}
            {step === "complete" && "Filing has been created successfully"}
          </DialogDescription>
        </DialogHeader>

        {step === "form" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Shareholder *</Label>
              <Select 
                value={formData.shareholderId} 
                onValueChange={(value) => setFormData({ ...formData, shareholderId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a person" />
                </SelectTrigger>
                <SelectContent>
                  {persons?.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.first_name} {person.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Share Class *</Label>
              <Select 
                value={formData.shareClassId} 
                onValueChange={(value) => setFormData({ ...formData, shareClassId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select share class" />
                </SelectTrigger>
                <SelectContent>
                  {shareClasses?.map((sc) => (
                    <SelectItem key={sc.id} value={sc.id}>
                      {sc.class_name} (£{sc.nominal_value} nominal)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sharesAllotted">Shares to Allot *</Label>
                <Input
                  id="sharesAllotted"
                  type="number"
                  min="1"
                  value={formData.sharesAllotted}
                  onChange={(e) => setFormData({ ...formData, sharesAllotted: e.target.value })}
                  placeholder="1000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricePerShare">Price per Share (£)</Label>
                <Input
                  id="pricePerShare"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.pricePerShare}
                  onChange={(e) => setFormData({ ...formData, pricePerShare: e.target.value })}
                  placeholder="1.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Allotment Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(formData.allotmentDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.allotmentDate}
                    onSelect={(date) => date && setFormData({ ...formData, allotmentDate: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {sharesNumber > 0 && selectedShareClass && (
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nominal Value</span>
                  <span>£{(sharesNumber * selectedShareClass.nominal_value).toFixed(2)}</span>
                </div>
                {totalConsideration > 0 && (
                  <div className="flex justify-between font-medium">
                    <span>Total Consideration</span>
                    <span>£{totalConsideration.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shareholder</span>
                <span className="font-medium">
                  {persons?.find(p => p.id === formData.shareholderId)?.first_name}{" "}
                  {persons?.find(p => p.id === formData.shareholderId)?.last_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Share Class</span>
                <span className="font-medium">{selectedShareClass?.class_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shares Allotted</span>
                <span className="font-medium">{sharesNumber.toLocaleString()}</span>
              </div>
              {pricePerShare > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price per Share</span>
                    <span className="font-medium">£{pricePerShare.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Consideration</span>
                    <span className="font-medium">£{totalConsideration.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Allotment Date</span>
                <span className="font-medium">{format(formData.allotmentDate, "d MMM yyyy")}</span>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                This will update the share register and create an SH01 filing for submission to Companies House.
              </p>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="py-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Filing Created</h3>
            <p className="text-muted-foreground mt-1">
              The SH01 filing has been created. Submit to Companies House when ready.
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
