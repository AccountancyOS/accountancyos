import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAY_FREQUENCY_LABELS } from "@/lib/payroll-constants";
import { toast } from "sonner";

interface CreatePayRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  preSelectedSchemeId?: string | null;
  taxYear: string;
}

export function CreatePayRunDialog({ open, onOpenChange, onSuccess, preSelectedSchemeId, taxYear }: CreatePayRunDialogProps) {
  const { organization } = useOrganization();
  const [schemeId, setSchemeId] = useState(preSelectedSchemeId || "");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [frequency, setFrequency] = useState<string>("monthly");
  const [taxPeriod, setTaxPeriod] = useState("1");

  const { data: schemes } = useQuery({
    queryKey: ["paye-schemes-list", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data } = await supabase
        .from("paye_schemes")
        .select("id, employer_paye_reference, name, companies(company_name)")
        .eq("organization_id", organization.id);
      return data || [];
    },
    enabled: open && !!organization?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !schemeId) throw new Error("Missing required fields");
      const { error } = await supabase.from("pay_runs").insert({
        organization_id: organization.id,
        paye_scheme_id: schemeId,
        period_start: periodStart,
        period_end: periodEnd,
        payment_date: paymentDate,
        pay_frequency: frequency,
        tax_year: taxYear,
        tax_period: parseInt(taxPeriod),
        status: "draft",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pay run created");
      onSuccess();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Pay Run</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>PAYE Scheme</Label>
            <Select value={schemeId} onValueChange={setSchemeId}>
              <SelectTrigger><SelectValue placeholder="Select scheme" /></SelectTrigger>
              <SelectContent>
                {schemes?.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name || s.employer_paye_reference} {s.companies?.company_name && `(${s.companies.company_name})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAY_FREQUENCY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Period Start</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <Label>Period End</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Payment Date</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div>
              <Label>Tax Period</Label>
              <Input type="number" min="1" max="12" value={taxPeriod} onChange={(e) => setTaxPeriod(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!schemeId || !periodStart || !periodEnd || !paymentDate || createMutation.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}