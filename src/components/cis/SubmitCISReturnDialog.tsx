import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface SubmitCISReturnDialogProps {
  cisReturnId: string;
  contractorId: string;
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function SubmitCISReturnDialog({ cisReturnId, open, onOpenChange, onSuccess }: SubmitCISReturnDialogProps) {
  const [employmentDeclaration, setEmploymentDeclaration] = useState(false);
  const [verificationDeclaration, setVerificationDeclaration] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
    },
    onSuccess: () => {
      toast.success("CIS return submitted");
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: any) => toast.error(error.message || "Submission failed"),
  });

  const canSubmit = employmentDeclaration && verificationDeclaration;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit CIS Return to HMRC</DialogTitle>
          <DialogDescription>Please confirm the declarations before submitting.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start space-x-2">
            <Checkbox id="employment" checked={employmentDeclaration} onCheckedChange={(c) => setEmploymentDeclaration(!!c)} />
            <Label htmlFor="employment" className="text-sm leading-tight">I confirm that I have considered the employment status of all workers included in this return</Label>
          </div>
          <div className="flex items-start space-x-2">
            <Checkbox id="verification" checked={verificationDeclaration} onCheckedChange={(c) => setVerificationDeclaration(!!c)} />
            <Label htmlFor="verification" className="text-sm leading-tight">I confirm that all subcontractors have been verified with HMRC</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => submitMutation.mutate()} disabled={!canSubmit || submitMutation.isPending}>
            {submitMutation.isPending ? "Submitting..." : "Submit to HMRC"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
