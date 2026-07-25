import { useState, useEffect, useRef } from "react";
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
import { Plus, X, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { getDefaultServiceCodesForLeadType, isIncludedLine } from "@/lib/quote-defaults";
import {
  isSaServiceCode,
  buildSaLines,
  saStartYearFromLabel,
  recentTaxYearStartYears,
} from "@/lib/proposal/sa-periods";

interface CreateQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLeadId?: string;
}

interface QuoteLine {
  service_id: string;
  quantity: number;
  unit_price: number;
  billing_frequency: "now" | "monthly";
  // Proposal Phase 1 T3: exact compliance period carried per line (SA tax year, etc.).
  // The materialize engine COALESCEs these over its computed fallback → one job per period.
  period_start?: string | null;
  period_end?: string | null;
  period_label?: string | null;
}

/**
 * Reconcile the SA lines for one service to exactly `selectedStartYears`, one
 * period-carrying line per year. Prices/billing already set for a year that
 * survives the change are preserved; new years default to the service price.
 * The rebuilt group is kept where the first existing line for that service sat.
 */
function reconcileSaLines(
  prev: QuoteLine[],
  serviceId: string,
  defaultPrice: number,
  selectedStartYears: number[]
): QuoteLine[] {
  const priceByYear = new Map<number, { unit_price: number; billing_frequency: "now" | "monthly" }>();
  prev.forEach((l) => {
    if (l.service_id === serviceId && l.period_label) {
      priceByYear.set(saStartYearFromLabel(l.period_label), {
        unit_price: l.unit_price,
        billing_frequency: l.billing_frequency,
      });
    }
  });

  const built: QuoteLine[] = buildSaLines({ service_id: serviceId, default_price: defaultPrice }, selectedStartYears).map(
    (b) => {
      const existing = priceByYear.get(saStartYearFromLabel(b.period_label));
      return existing ? { ...b, unit_price: existing.unit_price, billing_frequency: existing.billing_frequency } : b;
    }
  );

  const others = prev.filter((l) => l.service_id !== serviceId);
  if (built.length === 0) return others;

  const firstIdx = prev.findIndex((l) => l.service_id === serviceId);
  if (firstIdx === -1) return [...others, ...built];
  const precedingOthers = prev.slice(0, firstIdx).filter((l) => l.service_id !== serviceId).length;
  const result = [...others];
  result.splice(precedingOthers, 0, ...built);
  return result;
}

const CreateQuoteDialog = ({ open, onOpenChange, initialLeadId }: CreateQuoteDialogProps) => {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [leadId, setLeadId] = useState(initialLeadId || "");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [showPricing, setShowPricing] = useState(true);
  const [lines, setLines] = useState<QuoteLine[]>([
    { service_id: "", quantity: 1, unit_price: 0, billing_frequency: "now" },
  ]);
  const autoPopulatedRef = useRef(false);

  const { data: leads } = useQuery({
    queryKey: ["leads", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("id, first_name, last_name, email, lead_type")
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

  // Reset selected lead when dialog opens with a new initialLeadId
  useEffect(() => {
    if (open) {
      setLeadId(initialLeadId || "");
      autoPopulatedRef.current = false;
    }
  }, [open, initialLeadId]);

  // Auto-populate default service lines once leads + services + initialLeadId are available
  useEffect(() => {
    if (!open || autoPopulatedRef.current) return;
    if (!initialLeadId || !leads || !services) return;
    const lead = leads.find((l) => l.id === initialLeadId);
    if (!lead) return;
    const defaults = getDefaultServiceCodesForLeadType((lead as any).lead_type);
    if (defaults.length === 0) {
      autoPopulatedRef.current = true;
      return;
    }
    // Only overwrite the initial single empty line — don't clobber user edits
    const isInitial =
      lines.length === 1 && !lines[0].service_id && lines[0].unit_price === 0;
    if (!isInitial) {
      autoPopulatedRef.current = true;
      return;
    }
    const newLines: QuoteLine[] = [];
    for (const def of defaults) {
      const svc = services.find((s: any) => s.canonical_service_code === def.code);
      if (!svc) continue;
      newLines.push({
        service_id: svc.id,
        quantity: 1,
        unit_price: svc.default_price ?? 0,
        billing_frequency: def.billing_frequency,
      });
    }
    if (newLines.length > 0) setLines(newLines);
    autoPopulatedRef.current = true;
  }, [open, initialLeadId, leads, services, lines]);

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
      const quoteLines = lines.map((line, index) => {
        const svc = services?.find((s) => s.id === line.service_id);
        return {
          organization_id: organization.id,
          quote_id: quote.id,
          service_id: line.service_id,
          canonical_service_code: svc?.canonical_service_code ?? null,
          quantity: line.quantity,
          unit_price: line.unit_price,
          subtotal: line.quantity * line.unit_price,
          billing_frequency: line.billing_frequency,
          line_order: index,
          // Proposal Phase 1 T3: per-line exact period (SA tax year). Null for
          // non-period lines — the engine falls back to its computed period.
          period_start: line.period_start ?? null,
          period_end: line.period_end ?? null,
          period_label: line.period_label ?? null,
        };
      });

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
    setLines([...lines, { service_id: "", quantity: 1, unit_price: 0, billing_frequency: "now" }]);
  };

  const removeLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  // Recent tax years to offer for SA selection: current tax year + previous 6.
  const saYearOptions = recentTaxYearStartYears(7);

  const selectedSaYears = (serviceId: string): number[] =>
    lines
      .filter((l) => l.service_id === serviceId && l.period_label)
      .map((l) => saStartYearFromLabel(l.period_label as string));

  const toggleSaYear = (serviceId: string, defaultPrice: number, year: number) => {
    const current = selectedSaYears(serviceId);
    const next = current.includes(year) ? current.filter((y) => y !== year) : [...current, year];
    setLines((prev) => reconcileSaLines(prev, serviceId, defaultPrice, next));
  };

  const updateLine = (index: number, field: keyof QuoteLine, value: any) => {
    // Selecting an SA service turns the line into a per-tax-year group: default to
    // the current tax year (one line/one job) and reveal the tax-year multiselect.
    if (field === "service_id") {
      const service = services?.find((s) => s.id === value);
      if (service && isSaServiceCode((service as any).code)) {
        const existing = selectedSaYears(service.id);
        const years = existing.length > 0 ? existing : [recentTaxYearStartYears(1)[0]];
        setLines((prev) => {
          // Point the just-edited line at the SA service, then reconcile the group.
          const seeded = [...prev];
          seeded[index] = { ...seeded[index], service_id: service.id, unit_price: service.default_price };
          return reconcileSaLines(seeded, service.id, service.default_price, years);
        });
        return;
      }
    }

    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };

    // Auto-populate unit price when a (non-SA) service is selected
    if (field === "service_id") {
      const service = services?.find((s) => s.id === value);
      if (service) {
        newLines[index].unit_price = service.default_price;
      }
    }

    setLines(newLines);
  };

  const payableNow = lines
    .filter((line) => line.billing_frequency === "now" && !isIncludedLine(line))
    .reduce((sum, line) => sum + line.quantity * line.unit_price, 0);

  const payableMonthly = lines
    .filter((line) => line.billing_frequency === "monthly" && !isIncludedLine(line))
    .reduce((sum, line) => sum + line.quantity * (line.unit_price / 12), 0);

  const totalAmount = payableNow + payableMonthly;

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
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-pricing"
                    checked={showPricing}
                    onCheckedChange={setShowPricing}
                  />
                  <Label htmlFor="show-pricing" className="text-sm cursor-pointer">
                    {showPricing ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    <span className="ml-1">Show pricing details</span>
                  </Label>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Line
                </Button>
              </div>
            </div>

            {lines.map((line, index) => {
              const service = services?.find((s) => s.id === line.service_id);
              const included = isIncludedLine(line);
              const isSa = !!service && isSaServiceCode((service as any).code);
              // Render the tax-year multiselect once, on the first line of each SA group.
              const isSaGroupHead =
                isSa &&
                lines.findIndex((l) => l.service_id === line.service_id) === index;
              const monthlyPrice = line.billing_frequency === "monthly"
                ? line.unit_price / 12
                : line.unit_price;
              const displaySubtotal = line.billing_frequency === "monthly"
                ? (line.quantity * monthlyPrice)
                : (line.quantity * line.unit_price);

              return (
                <div key={index} className="space-y-2">
                {isSaGroupHead && service && (
                  <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                    <div className="text-sm font-medium">
                      Which tax years? ({service.name})
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Each selected year becomes its own return, line and job — priced independently.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(new Set([...saYearOptions, ...selectedSaYears(service.id)]))
                        .sort((a, b) => b - a)
                        .map((year) => {
                          const active = selectedSaYears(service.id).includes(year);
                          const label = `${year}/${String(year + 1).slice(-2).padStart(2, "0")}`;
                          return (
                            <Button
                              key={year}
                              type="button"
                              size="sm"
                              variant={active ? "default" : "outline"}
                              onClick={() => toggleSaYear(service.id, service.default_price, year)}
                            >
                              {label}
                            </Button>
                          );
                        })}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 items-end">
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
                            {service.name} - £{service.default_price.toFixed(2)}/year
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-32 space-y-2">
                    <Label>Billing</Label>
                    <Select
                      value={line.billing_frequency}
                      onValueChange={(value: "now" | "monthly") =>
                        updateLine(index, "billing_frequency", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="now">Bill Now</SelectItem>
                        <SelectItem value="monthly">Bill Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {showPricing && (
                    <>
                      {isSa ? (
                        <div className="w-24 space-y-2">
                          <Label>Tax Year</Label>
                          <div className="h-10 flex items-center px-3 border rounded-md bg-muted font-medium text-sm">
                            {line.period_label ?? "—"}
                          </div>
                        </div>
                      ) : (
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
                      )}

                      <div className="w-32 space-y-2">
                        <Label>Annual Price</Label>
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
                        <Label>
                          {included ? "Included" : line.billing_frequency === "monthly" ? "Monthly" : "Now"}
                        </Label>
                        <div className="h-10 flex items-center px-3 border rounded-md bg-muted font-medium">
                          {included ? (
                            <span className="text-emerald-700 text-sm">Included</span>
                          ) : (
                            <>£{displaySubtotal.toFixed(2)}</>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {!showPricing && service && (
                    <div className="flex-1 text-sm text-muted-foreground italic">
                      {service.name}
                    </div>
                  )}

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
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t space-y-3">
            <div className="flex justify-between items-center">
              <div className="text-sm font-medium">Payable Now</div>
              <div className="text-lg font-semibold">
                £{payableNow.toFixed(2)}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <div className="text-sm font-medium">Payable Monthly</div>
              <div className="text-lg font-semibold">
                £{payableMonthly.toFixed(2)}
              </div>
            </div>
            <div className="flex justify-between items-center pt-3 border-t">
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
