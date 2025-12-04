import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface TransferSharesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
}

export function TransferSharesDialog({ open, onOpenChange, companyId }: TransferSharesDialogProps) {
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    fromShareholderId: "",
    toShareholderId: "",
    shareClassId: "",
    sharesTransferred: "",
    consideration: "",
    transferDate: new Date().toISOString().split("T")[0],
  });

  // Fetch shareholders with shares
  const { data: shareholders } = useQuery({
    queryKey: ["company-shareholders-with-shares", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_shareholders")
        .select(`
          id,
          shares_held,
          share_class_id,
          share_class:company_share_classes(id, class_name),
          person:company_persons(id, title, first_name, last_name)
        `)
        .eq("company_id", companyId)
        .gt("shares_held", 0);
      if (error) throw error;
      return data;
    },
  });

  // Fetch all shareholders (including zero balance for transfers TO)
  const { data: allShareholders } = useQuery({
    queryKey: ["company-all-shareholders", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_shareholders")
        .select(`
          id,
          shares_held,
          share_class_id,
          share_class:company_share_classes(id, class_name),
          person:company_persons(id, title, first_name, last_name)
        `)
        .eq("company_id", companyId);
      if (error) throw error;
      return data;
    },
  });

  const selectedFromShareholder = shareholders?.find(s => s.id === formData.fromShareholderId);
  const availableToShareholders = allShareholders?.filter(
    s => s.id !== formData.fromShareholderId && s.share_class_id === selectedFromShareholder?.share_class_id
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const sharesTransferred = parseInt(formData.sharesTransferred);
      const consideration = formData.consideration ? parseFloat(formData.consideration) : null;

      // Validate
      if (!selectedFromShareholder || sharesTransferred > Number(selectedFromShareholder.shares_held)) {
        throw new Error("Cannot transfer more shares than available");
      }

      const { error } = await supabase
        .from("company_share_transfers")
        .insert({
          company_id: companyId,
          share_class_id: selectedFromShareholder.share_class_id,
          from_shareholder_id: formData.fromShareholderId,
          to_shareholder_id: formData.toShareholderId,
          shares_transferred: sharesTransferred,
          transfer_date: formData.transferDate,
          consideration,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shares transferred successfully");
      queryClient.invalidateQueries({ queryKey: ["company-shareholders", companyId] });
      queryClient.invalidateQueries({ queryKey: ["company-shareholders-with-shares", companyId] });
      queryClient.invalidateQueries({ queryKey: ["company-all-shareholders", companyId] });
      queryClient.invalidateQueries({ queryKey: ["company-transfers", companyId] });
      queryClient.invalidateQueries({ queryKey: ["register-events", companyId] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error("Failed to transfer shares", { description: error.message });
    },
  });

  const resetForm = () => {
    setFormData({
      fromShareholderId: "",
      toShareholderId: "",
      shareClassId: "",
      sharesTransferred: "",
      consideration: "",
      transferDate: new Date().toISOString().split("T")[0],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer Shares</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="fromShareholderId">Transfer From *</Label>
            <Select
              value={formData.fromShareholderId}
              onValueChange={(v) => setFormData(prev => ({ 
                ...prev, 
                fromShareholderId: v,
                toShareholderId: "", // Reset TO when FROM changes
              }))}
            >
              <SelectTrigger id="fromShareholderId">
                <SelectValue placeholder="Select shareholder" />
              </SelectTrigger>
              <SelectContent>
                {shareholders?.map(sh => (
                  <SelectItem key={sh.id} value={sh.id}>
                    {sh.person?.title} {sh.person?.first_name} {sh.person?.last_name} - {sh.share_class?.class_name} ({Number(sh.shares_held).toLocaleString()} shares)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(!shareholders || shareholders.length === 0) && (
              <p className="text-xs text-muted-foreground mt-1">
                No shareholders with shares available.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="toShareholderId">Transfer To *</Label>
            <Select
              value={formData.toShareholderId}
              onValueChange={(v) => setFormData(prev => ({ ...prev, toShareholderId: v }))}
              disabled={!formData.fromShareholderId}
            >
              <SelectTrigger id="toShareholderId">
                <SelectValue placeholder={formData.fromShareholderId ? "Select recipient" : "Select FROM first"} />
              </SelectTrigger>
              <SelectContent>
                {availableToShareholders?.map(sh => (
                  <SelectItem key={sh.id} value={sh.id}>
                    {sh.person?.title} {sh.person?.first_name} {sh.person?.last_name} ({Number(sh.shares_held).toLocaleString()} shares)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formData.fromShareholderId && (!availableToShareholders || availableToShareholders.length === 0) && (
              <p className="text-xs text-muted-foreground mt-1">
                No other shareholders with same share class. Create a shareholder first via Allot Shares.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="sharesTransferred">Number of Shares *</Label>
            <Input
              id="sharesTransferred"
              type="number"
              min="1"
              max={selectedFromShareholder ? Number(selectedFromShareholder.shares_held) : undefined}
              value={formData.sharesTransferred}
              onChange={(e) => setFormData(prev => ({ ...prev, sharesTransferred: e.target.value }))}
              required
            />
            {selectedFromShareholder && (
              <p className="text-xs text-muted-foreground mt-1">
                Available: {Number(selectedFromShareholder.shares_held).toLocaleString()} shares
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="consideration">Consideration (optional)</Label>
            <Input
              id="consideration"
              type="number"
              step="0.01"
              min="0"
              value={formData.consideration}
              onChange={(e) => setFormData(prev => ({ ...prev, consideration: e.target.value }))}
              placeholder="£0.00"
            />
          </div>

          <div>
            <Label htmlFor="transferDate">Transfer Date *</Label>
            <Input
              id="transferDate"
              type="date"
              value={formData.transferDate}
              onChange={(e) => setFormData(prev => ({ ...prev, transferDate: e.target.value }))}
              required
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending || 
              !formData.fromShareholderId || 
              !formData.toShareholderId || 
              !formData.sharesTransferred
            }
          >
            {mutation.isPending ? "Transferring..." : "Transfer Shares"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
