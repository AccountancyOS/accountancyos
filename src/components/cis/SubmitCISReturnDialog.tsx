import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { submitCISReturn } from "@/lib/cis-service";
import { useAuth } from "@/lib/auth-context";

interface SubmitCISReturnDialogProps {
  cisReturnId: string;
  contractorId: string;
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function SubmitCISReturnDialog({ 
  cisReturnId, 
  contractorId, 
  organizationId, 
  open, 
  onOpenChange, 
  onSuccess 
}: SubmitCISReturnDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [employmentDeclaration, setEmploymentDeclaration] = useState(false);
  const [verificationDeclaration, setVerificationDeclaration] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated");
      const result = await submitCISReturn(
        cisReturnId, 
        user.id, 
        employmentDeclaration, 
        verificationDeclaration
      );
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      toast.success("CIS return submitted successfully");
      queryClient.invalidateQueries({ queryKey: ["cis-return-detail", cisReturnId] });
      queryClient.invalidateQueries({ queryKey: ["cis-returns"] });
      queryClient.invalidateQueries({ queryKey: ["filings"] });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: any) => toast.error(error.message || "Submission failed"),
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset state when closing
      setEmploymentDeclaration(false);
      setVerificationDeclaration(false);
    }
    onOpenChange(open);
  };

  const canSubmit = employmentDeclaration && verificationDeclaration;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit CIS Return to HMRC</DialogTitle>
          <DialogDescription>
            Please confirm the declarations before submitting the monthly CIS return.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start space-x-2">
            <Checkbox 
              id="employment" 
              checked={employmentDeclaration} 
              onCheckedChange={(c) => setEmploymentDeclaration(!!c)} 
            />
            <Label htmlFor="employment" className="text-sm leading-tight">
              I confirm that I have considered the employment status of all workers included in this return 
              and that the payments are correctly treated as self-employment income
            </Label>
          </div>
          <div className="flex items-start space-x-2">
            <Checkbox 
              id="verification" 
              checked={verificationDeclaration} 
              onCheckedChange={(c) => setVerificationDeclaration(!!c)} 
            />
            <Label htmlFor="verification" className="text-sm leading-tight">
              I confirm that all subcontractors have been verified with HMRC and the correct 
              deduction rates have been applied
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => submitMutation.mutate()} 
            disabled={!canSubmit || submitMutation.isPending}
          >
            {submitMutation.isPending ? "Submitting..." : "Submit to HMRC"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
