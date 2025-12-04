import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface AddShareClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
}

export function AddShareClassDialog({ open, onOpenChange, companyId }: AddShareClassDialogProps) {
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    className: "Ordinary",
    nominalValue: "1.0000",
    currency: "GBP",
    votingRights: true,
    dividendRights: true,
    capitalRights: true,
    rightsDescription: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("company_share_classes")
        .insert({
          company_id: companyId,
          class_name: formData.className,
          nominal_value: parseFloat(formData.nominalValue),
          currency: formData.currency,
          voting_rights: formData.votingRights,
          dividend_rights: formData.dividendRights,
          capital_rights: formData.capitalRights,
          rights_description: formData.rightsDescription || null,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Share class created");
      queryClient.invalidateQueries({ queryKey: ["company-share-classes", companyId] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error("Failed to create share class", { description: error.message });
    },
  });

  const resetForm = () => {
    setFormData({
      className: "Ordinary",
      nominalValue: "1.0000",
      currency: "GBP",
      votingRights: true,
      dividendRights: true,
      capitalRights: true,
      rightsDescription: "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Share Class</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="className">Class Name *</Label>
            <Input
              id="className"
              value={formData.className}
              onChange={(e) => setFormData(prev => ({ ...prev, className: e.target.value }))}
              placeholder="e.g. Ordinary, Preference A"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="nominalValue">Nominal Value *</Label>
              <Input
                id="nominalValue"
                type="number"
                step="0.0001"
                min="0.0001"
                value={formData.nominalValue}
                onChange={(e) => setFormData(prev => ({ ...prev, nominalValue: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={(v) => setFormData(prev => ({ ...prev, currency: v }))}
              >
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Rights</Label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="votingRights"
                  checked={formData.votingRights}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, votingRights: checked === true }))
                  }
                />
                <label htmlFor="votingRights" className="text-sm cursor-pointer">
                  Voting Rights
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="dividendRights"
                  checked={formData.dividendRights}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, dividendRights: checked === true }))
                  }
                />
                <label htmlFor="dividendRights" className="text-sm cursor-pointer">
                  Dividend Rights
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="capitalRights"
                  checked={formData.capitalRights}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, capitalRights: checked === true }))
                  }
                />
                <label htmlFor="capitalRights" className="text-sm cursor-pointer">
                  Capital Rights (on winding up)
                </label>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="rightsDescription">Rights Description (optional)</Label>
            <Textarea
              id="rightsDescription"
              value={formData.rightsDescription}
              onChange={(e) => setFormData(prev => ({ ...prev, rightsDescription: e.target.value }))}
              placeholder="Describe any specific rights attached to this share class..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !formData.className || !formData.nominalValue}
          >
            {mutation.isPending ? "Creating..." : "Create Share Class"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
