import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface SubmitRTIDialogProps {
  payRunId: string;
  payeSchemeId: string;
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function SubmitRTIDialog({ payRunId, open, onOpenChange, onSuccess }: SubmitRTIDialogProps) {
  const [submitFPS, setSubmitFPS] = useState(true);
  const [submitEPS, setSubmitEPS] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async () => {
      // In production, this would call the filing service
      await new Promise(resolve => setTimeout(resolve, 1000));
      // submitPayrollFiling would be called here
    },
    onSuccess: () => {
      toast.success("RTI submission initiated");
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: any) => toast.error(error.message || "Submission failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit RTI to HMRC</DialogTitle>
          <DialogDescription>Select which RTI submissions to send for this pay run.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="fps" checked={submitFPS} onCheckedChange={(c) => setSubmitFPS(!!c)} />
            <Label htmlFor="fps">Full Payment Submission (FPS)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="eps" checked={submitEPS} onCheckedChange={(c) => setSubmitEPS(!!c)} />
            <Label htmlFor="eps">Employer Payment Summary (EPS)</Label>
          </div>
          <div className="flex items-center space-x-2 pt-4 border-t">
            <Checkbox id="confirm" checked={confirmed} onCheckedChange={(c) => setConfirmed(!!c)} />
            <Label htmlFor="confirm" className="text-sm">I confirm all figures are correct and authorize submission to HMRC</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => submitMutation.mutate()} disabled={!confirmed || (!submitFPS && !submitEPS) || submitMutation.isPending}>
            {submitMutation.isPending ? "Submitting..." : "Submit to HMRC"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
