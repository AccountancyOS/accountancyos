import { useState } from "react";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useToast } from "@/hooks/use-toast";
import { Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface CreateQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface QuoteLine {
  service_id: string;
  quantity: number;
  unit_price: number;
}

const CreateQuoteDialog = ({ open, onOpenChange }: CreateQuoteDialogProps) => {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [leadId, setLeadId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<QuoteLine[]>([
    { service_id: "", quantity: 1, unit_price: 0 },
  ]);

  const { data: leads } = useQuery({
    queryKey: ["leads", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("id, first_name, last_name, email")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id && open,
  });

  const { data: services } = useQuery({
    queryKey: ["services", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("services_catalog")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id && open,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");

      // Generate quote number
      const { data: quoteNumber, error: fnError } = await supabase.rpc(
        "generate_quote_number",
        { org_id: organization.id }
      );
      if (fnError) throw fnError;

      // Calculate total
      const total = lines.reduce(
        (sum, line) => sum + line.quantity * line.unit_price,
        0
      );

      // Create quote
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          organization_id: organization.id,
          quote_number: quoteNumber,
          lead_id: leadId || null,
          total_amount: total,
          valid_until: validUntil || null,
          notes: notes || null,
          status: "draft",
        })
        .select()
        .single();

      if (quoteError) throw quoteError;

      // Create quote lines
      const quoteLines = lines.map((line, index) => ({
        organization_id: organization.id,
        quote_id: quote.id,
        service_id: line.service_id,
        quantity: line.quantity,
        unit_price: line.unit_price,
        subtotal: line.quantity * line.unit_price,
        line_order: index,
      }));

      const { error: linesError } = await supabase
        .from("quote_lines")
        .insert(quoteLines);

      if (linesError) throw linesError;

      return quote;
    },
    onSuccess: (quote) => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({ title: "Quote created successfully" });
      onOpenChange(false);
      navigate(`/quotes/${quote.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error creating quote",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addLine = () => {
    setLines([...lines, { service_id: "", quantity: 1, unit_price: 0 }]);
  };

  const removeLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof QuoteLine, value: any) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };

    // Auto-populate unit price when service is selected
    if (field === "service_id") {
      const service = services?.find((s) => s.id === value);
      if (service) {
        newLines[index].unit_price = service.default_price;
      }
    }

    setLines(newLines);
  };

  const totalAmount = lines.reduce(
    (sum, line) => sum + line.quantity * line.unit_price,
    0
  );

  const canSubmit = lines.every((l) => l.service_id && l.quantity > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Quote</DialogTitle>
          <DialogDescription>
            Build a quote for a lead with services from your catalog
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="lead">Lead (Optional)</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a lead..." />
              </SelectTrigger>
              <SelectContent>
                {leads?.map((lead) => (
                  <SelectItem key={lead.id} value={lead.id}>
                    {lead.first_name} {lead.last_name} ({lead.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="valid_until">Valid Until</Label>
            <Input
              id="valid_until"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Quote Lines</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-2" />
                Add Line
              </Button>
            </div>

            {lines.map((line, index) => (
              <div key={index} className="flex gap-2 items-end">
                <div className="flex-1 space-y-2">
                  <Label>Service</Label>
                  <Select
                    value={line.service_id}
                    onValueChange={(value) => updateLine(index, "service_id", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select service..." />
                    </SelectTrigger>
                    <SelectContent>
                      {services?.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name} - £{service.default_price.toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-24 space-y-2">
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    min="1"
                    step="0.1"
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(index, "quantity", parseFloat(e.target.value))
                    }
                  />
                </div>

                <div className="w-32 space-y-2">
                  <Label>Unit Price</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unit_price}
                    onChange={(e) =>
                      updateLine(index, "unit_price", parseFloat(e.target.value))
                    }
                  />
                </div>

                <div className="w-32 space-y-2">
                  <Label>Subtotal</Label>
                  <div className="h-10 flex items-center px-3 border rounded-md bg-muted font-medium">
                    £{(line.quantity * line.unit_price).toFixed(2)}
                  </div>
                </div>

                {lines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-4 border-t">
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Total Amount</div>
              <div className="text-2xl font-semibold">
                £{totalAmount.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional notes for this quote..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
            >
              Create Quote
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateQuoteDialog;
