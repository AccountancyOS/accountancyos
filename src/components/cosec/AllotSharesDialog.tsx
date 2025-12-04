import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface AllotSharesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  organizationId: string;
}

export function AllotSharesDialog({ open, onOpenChange, companyId, organizationId }: AllotSharesDialogProps) {
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    personId: "",
    shareClassId: "",
    sharesAllotted: "",
    pricePerShare: "",
    allotmentDate: new Date().toISOString().split("T")[0],
  });

  // Fetch share classes
  const { data: shareClasses } = useQuery({
    queryKey: ["company-share-classes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_share_classes")
        .select("id, class_name, nominal_value, currency")
        .eq("company_id", companyId);
      if (error) throw error;
      return data;
    },
  });

  // Fetch persons
  const { data: persons } = useQuery({
    queryKey: ["company-persons", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_persons")
        .select("id, title, first_name, last_name")
        .eq("organization_id", organizationId)
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      // First, find or create shareholder record
      const { data: existingShareholder } = await supabase
        .from("company_shareholders")
        .select("id")
        .eq("company_id", companyId)
        .eq("person_id", formData.personId)
        .eq("share_class_id", formData.shareClassId)
        .single();

      let shareholderId: string;

      if (existingShareholder) {
        shareholderId = existingShareholder.id;
      } else {
        // Create new shareholder record
        const { data: newShareholder, error: shError } = await supabase
          .from("company_shareholders")
          .insert({
            company_id: companyId,
            person_id: formData.personId,
            share_class_id: formData.shareClassId,
            shares_held: 0, // Will be updated by trigger
            as_at_date: formData.allotmentDate,
          })
          .select()
          .single();

        if (shError) throw shError;
        shareholderId = newShareholder.id;
      }

      // Create allotment (trigger will update shareholder balance)
      const sharesAllotted = parseInt(formData.sharesAllotted);
      const pricePerShare = formData.pricePerShare ? parseFloat(formData.pricePerShare) : null;
      const totalConsideration = pricePerShare ? sharesAllotted * pricePerShare : null;

      const { error: allotError } = await supabase
        .from("company_share_allotments")
        .insert({
          company_id: companyId,
          share_class_id: formData.shareClassId,
          shareholder_id: shareholderId,
          shares_allotted: sharesAllotted,
          price_per_share: pricePerShare,
          total_consideration: totalConsideration,
          allotment_date: formData.allotmentDate,
        });

      if (allotError) throw allotError;
    },
    onSuccess: () => {
      toast.success("Shares allotted successfully");
      queryClient.invalidateQueries({ queryKey: ["company-shareholders", companyId] });
      queryClient.invalidateQueries({ queryKey: ["company-allotments", companyId] });
      queryClient.invalidateQueries({ queryKey: ["company-share-classes", companyId] });
      queryClient.invalidateQueries({ queryKey: ["register-events", companyId] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error("Failed to allot shares", { description: error.message });
    },
  });

  const resetForm = () => {
    setFormData({
      personId: "",
      shareClassId: "",
      sharesAllotted: "",
      pricePerShare: "",
      allotmentDate: new Date().toISOString().split("T")[0],
    });
  };

  const selectedShareClass = shareClasses?.find(sc => sc.id === formData.shareClassId);
  const totalConsideration = formData.sharesAllotted && formData.pricePerShare
    ? (parseInt(formData.sharesAllotted) * parseFloat(formData.pricePerShare)).toFixed(2)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Allot Shares</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="personId">Shareholder *</Label>
            <Select
              value={formData.personId}
              onValueChange={(v) => setFormData(prev => ({ ...prev, personId: v }))}
            >
              <SelectTrigger id="personId">
                <SelectValue placeholder="Select person" />
              </SelectTrigger>
              <SelectContent>
                {persons?.map(person => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.title} {person.first_name} {person.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(!persons || persons.length === 0) && (
              <p className="text-xs text-muted-foreground mt-1">
                No persons available. Add a person first via Officers or PSCs.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="shareClassId">Share Class *</Label>
            <Select
              value={formData.shareClassId}
              onValueChange={(v) => setFormData(prev => ({ ...prev, shareClassId: v }))}
            >
              <SelectTrigger id="shareClassId">
                <SelectValue placeholder="Select share class" />
              </SelectTrigger>
              <SelectContent>
                {shareClasses?.map(sc => (
                  <SelectItem key={sc.id} value={sc.id}>
                    {sc.class_name} ({sc.currency} {Number(sc.nominal_value).toFixed(4)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(!shareClasses || shareClasses.length === 0) && (
              <p className="text-xs text-muted-foreground mt-1">
                No share classes defined. Create a share class first.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="sharesAllotted">Number of Shares *</Label>
            <Input
              id="sharesAllotted"
              type="number"
              min="1"
              value={formData.sharesAllotted}
              onChange={(e) => setFormData(prev => ({ ...prev, sharesAllotted: e.target.value }))}
              required
            />
          </div>

          <div>
            <Label htmlFor="pricePerShare">Price per Share (optional)</Label>
            <Input
              id="pricePerShare"
              type="number"
              step="0.0001"
              min="0"
              value={formData.pricePerShare}
              onChange={(e) => setFormData(prev => ({ ...prev, pricePerShare: e.target.value }))}
              placeholder={selectedShareClass ? `Nominal: ${selectedShareClass.currency} ${Number(selectedShareClass.nominal_value).toFixed(4)}` : ""}
            />
          </div>

          <div>
            <Label htmlFor="allotmentDate">Allotment Date *</Label>
            <Input
              id="allotmentDate"
              type="date"
              value={formData.allotmentDate}
              onChange={(e) => setFormData(prev => ({ ...prev, allotmentDate: e.target.value }))}
              required
            />
          </div>

          {totalConsideration && (
            <div className="bg-muted rounded-md p-3">
              <p className="text-sm">
                <span className="text-muted-foreground">Total Consideration:</span>{" "}
                <span className="font-medium">{selectedShareClass?.currency} {totalConsideration}</span>
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending || 
              !formData.personId || 
              !formData.shareClassId || 
              !formData.sharesAllotted
            }
          >
            {mutation.isPending ? "Allotting..." : "Allot Shares"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
