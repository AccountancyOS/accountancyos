import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SAMoneyField } from "./SAMoneyField";
import type { AdjustmentsSchedule } from "@/types/filing-schemas";

interface Props {
  data: AdjustmentsSchedule;
  onChange: (d: AdjustmentsSchedule) => void;
  readonly?: boolean;
}

export function AdjustmentsScheduleEditor({ data, onChange, readonly }: Props) {
  const u = (p: Partial<AdjustmentsSchedule>) => onChange({ ...data, ...p });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Adjustments & Additional Charges</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {/* Student Loans */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Student Loan Plans</Label>
          <div className="flex flex-wrap gap-4">
            {(['plan1', 'plan2', 'plan4', 'plan5', 'postgrad'] as const).map((plan) => (
              <div key={plan} className="flex items-center gap-2">
                <Checkbox
                  checked={(data.student_loan_plan_type || []).includes(plan)}
                  onCheckedChange={(checked) => {
                    const current = data.student_loan_plan_type || [];
                    const updated = checked
                      ? [...current, plan]
                      : current.filter((p) => p !== plan);
                    u({ student_loan_plan_type: updated });
                  }}
                  disabled={readonly}
                />
                <Label className="text-sm">{plan.replace('plan', 'Plan ').replace('postgrad', 'Postgraduate')}</Label>
              </div>
            ))}
          </div>
          <SAMoneyField label="Student Loan Deductions" value={data.student_loan_deductions || 0} readonly />
        </div>

        {/* HICBC */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox checked={data.hicbc_applicable || false} onCheckedChange={(c) => u({ hicbc_applicable: !!c })} disabled={readonly} />
            <Label className="text-sm">High Income Child Benefit Charge applies</Label>
          </div>
          {data.hicbc_applicable && (
            <SAMoneyField label="HICBC Charge" value={data.hicbc_charge || 0} readonly />
          )}
        </div>

        {/* Marriage Allowance */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Marriage Allowance</Label>
          <Select
            value={data.marriage_allowance_transfer || 'none'}
            onValueChange={(v) => u({ marriage_allowance_transfer: v as any })}
            disabled={readonly}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="transfer_to_spouse">Transfer to Spouse</SelectItem>
              <SelectItem value="receive_from_spouse">Receive from Spouse</SelectItem>
            </SelectContent>
          </Select>
          {data.marriage_allowance_transfer !== 'none' && (
            <SAMoneyField label="Marriage Allowance Amount" value={data.marriage_allowance_amount || 0} readonly />
          )}
        </div>

        {/* Other adjustments */}
        <div className="grid grid-cols-2 gap-4">
          <SAMoneyField label="Underpaid Tax Coded Out" value={data.underpaid_tax_coded_out || 0} onChange={(v) => u({ underpaid_tax_coded_out: v })} readonly={readonly} />
          <SAMoneyField label="PoA Reduction Claimed" value={data.poa_reduction_claimed || 0} onChange={(v) => u({ poa_reduction_claimed: v })} readonly={readonly} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <SAMoneyField label="First Payment on Account" value={data.poa_first_payment || 0} readonly />
          <SAMoneyField label="Second Payment on Account" value={data.poa_second_payment || 0} readonly />
        </div>

        {/* Pension AA */}
        <div className="grid grid-cols-2 gap-4">
          <SAMoneyField label="Annual Allowance Charge" value={data.annual_allowance_charge || 0} onChange={(v) => u({ annual_allowance_charge: v })} readonly={readonly} />
          <div className="flex items-center gap-2 pt-6">
            <Checkbox checked={data.scheme_pays_election || false} onCheckedChange={(c) => u({ scheme_pays_election: !!c })} disabled={readonly} />
            <Label className="text-sm">Scheme Pays Election</Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
