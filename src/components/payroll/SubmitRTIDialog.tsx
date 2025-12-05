import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { submitPayRunRTI } from "@/lib/payrun-service";
import { useAuth } from "@/lib/auth-context";

interface SubmitRTIDialogProps {
  payRunId: string;
  payeSchemeId: string;
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function SubmitRTIDialog({ 
  payRunId, 
  payeSchemeId, 
  organizationId, 
  open, 
  onOpenChange, 
  onSuccess 
}: SubmitRTIDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [submitFPS, setSubmitFPS] = useState(true);
  const [submitEPS, setSubmitEPS] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated");
      const result = await submitPayRunRTI(payRunId, user.id, submitFPS, submitEPS);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      const filingTypes = data.filings?.map((f: any) => f.type).join(", ") || "RTI";
      toast.success(`${filingTypes} submitted successfully`);
      queryClient.invalidateQueries({ queryKey: ["pay-run-detail", payRunId] });
      queryClient.invalidateQueries({ queryKey: ["pay-run-filings", payRunId] });
      queryClient.invalidateQueries({ queryKey: ["filings"] });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: any) => toast.error(error.message || "Submission failed"),
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset state when closing
      setSubmitFPS(true);
      setSubmitEPS(false);
      setConfirmed(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit RTI to HMRC</DialogTitle>
          <DialogDescription>
            Select which RTI submissions to send for this pay run.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="fps" 
              checked={submitFPS} 
              onCheckedChange={(c) => setSubmitFPS(!!c)} 
            />
            <Label htmlFor="fps">Full Payment Submission (FPS)</Label>
          </div>
          <p className="text-sm text-muted-foreground ml-6">
            Required for every pay run - reports individual employee payments to HMRC
          </p>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="eps" 
              checked={submitEPS} 
              onCheckedChange={(c) => setSubmitEPS(!!c)} 
            />
            <Label htmlFor="eps">Employer Payment Summary (EPS)</Label>
          </div>
          <p className="text-sm text-muted-foreground ml-6">
            Only required to report statutory payments, apprenticeship levy, or if no employees were paid
          </p>
          
          <div className="flex items-center space-x-2 pt-4 border-t">
            <Checkbox 
              id="confirm" 
              checked={confirmed} 
              onCheckedChange={(c) => setConfirmed(!!c)} 
            />
            <Label htmlFor="confirm" className="text-sm">
              I confirm all figures are correct and authorize submission to HMRC
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => submitMutation.mutate()} 
            disabled={!confirmed || (!submitFPS && !submitEPS) || submitMutation.isPending}
          >
            {submitMutation.isPending ? "Submitting..." : "Submit to HMRC"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
