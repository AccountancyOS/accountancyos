/**
 * Add Manual Adjustment Dialog
 * Allows adding manual adjustment lines to workpaper (never overwrites TB lines)
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { addAdjustmentLine } from "@/lib/questionnaire-workpaper-service";

interface AddAdjustmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workpaperId: string;
  jobId: string;
  serviceType: string;
}

const ADJUSTMENT_CATEGORIES = {
  accounts: [
    { value: "revenue_adjustment", label: "Revenue Adjustment" },
    { value: "cost_adjustment", label: "Cost Adjustment" },
    { value: "overhead_adjustment", label: "Overhead Adjustment" },
    { value: "depreciation_adjustment", label: "Depreciation Adjustment" },
    { value: "provision", label: "Provision" },
    { value: "accrual", label: "Accrual" },
    { value: "prepayment", label: "Prepayment" },
    { value: "other_adjustment", label: "Other Adjustment" },
  ],
  ct600: [
    { value: "disallowable_expense", label: "Disallowable Expense" },
    { value: "capital_allowance", label: "Capital Allowance" },
    { value: "trading_adjustment", label: "Trading Adjustment" },
    { value: "loan_relationship", label: "Loan Relationship" },
    { value: "group_relief", label: "Group Relief" },
    { value: "other_adjustment", label: "Other Adjustment" },
  ],
  self_assessment: [
    { value: "employment_adjustment", label: "Employment Adjustment" },
    { value: "self_employment_adjustment", label: "Self-Employment Adjustment" },
    { value: "property_adjustment", label: "Property Adjustment" },
    { value: "capital_gains_adjustment", label: "Capital Gains Adjustment" },
    { value: "relief_claim", label: "Relief Claim" },
    { value: "other_adjustment", label: "Other Adjustment" },
  ],
  vat_return: [
    { value: "output_vat_adjustment", label: "Output VAT Adjustment" },
    { value: "input_vat_adjustment", label: "Input VAT Adjustment" },
    { value: "partial_exemption", label: "Partial Exemption Adjustment" },
    { value: "bad_debt_relief", label: "Bad Debt Relief" },
    { value: "other_adjustment", label: "Other Adjustment" },
  ],
};

export function AddAdjustmentDialog({
  isOpen,
  onClose,
  workpaperId,
  jobId,
  serviceType,
}: AddAdjustmentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [category, setCategory] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const categories = ADJUSTMENT_CATEGORIES[serviceType as keyof typeof ADJUSTMENT_CATEGORIES] 
    || ADJUSTMENT_CATEGORIES.accounts;

  const addAdjustmentMutation = useMutation({
    mutationFn: async () => {
      return addAdjustmentLine(workpaperId, {
        category,
        label: label || categories.find(c => c.value === category)?.label || "Adjustment",
        amount: parseFloat(amount) || 0,
        source: "manual_adjustment",
        notes: notes || undefined,
      });
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["job-workpaper", jobId] });
        toast({ title: "Adjustment added successfully" });
        handleClose();
      } else {
        toast({ title: "Failed to add adjustment", description: result.error, variant: "destructive" });
      }
    },
    onError: (error) => {
      toast({
        title: "Error adding adjustment",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setCategory("");
    setLabel("");
    setAmount("");
    setNotes("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !amount) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    addAdjustmentMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Manual Adjustment</DialogTitle>
          <DialogDescription>
            Add an adjustment line to the workpaper. This will not overwrite any
            Trial Balance data.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category">Adjustment Type *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select adjustment type" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="label">Description</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Depreciation add-back for car"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (£) *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground">
              Use positive for additions, negative for deductions
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any working notes or references..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={addAdjustmentMutation.isPending}>
              {addAdjustmentMutation.isPending ? "Adding..." : "Add Adjustment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
