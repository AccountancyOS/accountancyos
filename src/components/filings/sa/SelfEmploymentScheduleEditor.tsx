import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SAMoneyField } from "./SAMoneyField";
import type { SelfEmploymentSchedule } from "@/types/filing-schemas";

interface Props {
  data: SelfEmploymentSchedule;
  onChange: (data: SelfEmploymentSchedule) => void;
  readonly?: boolean;
}

export function SelfEmploymentScheduleEditor({ data, onChange, readonly }: Props) {
  const update = (patch: Partial<SelfEmploymentSchedule>) => onChange({ ...data, ...patch });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Self-Employment</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {/* Business info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-sm">Business Name</Label>
            <Input value={data.business_name || ''} onChange={(e) => update({ business_name: e.target.value })} readOnly={readonly} />
          </div>
          <div className="space-y-1">
            <Label className="text-sm">Business Description</Label>
            <Input value={data.business_description || ''} onChange={(e) => update({ business_description: e.target.value })} readOnly={readonly} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-sm">Business UTR</Label>
            <Input value={data.utr || ''} onChange={(e) => update({ utr: e.target.value })} readOnly={readonly} />
          </div>
          <div className="space-y-1">
            <Label className="text-sm">Period Start</Label>
            <Input type="date" value={data.accounting_period_start || ''} onChange={(e) => update({ accounting_period_start: e.target.value })} readOnly={readonly} />
          </div>
          <div className="space-y-1">
            <Label className="text-sm">Period End</Label>
            <Input type="date" value={data.accounting_period_end || ''} onChange={(e) => update({ accounting_period_end: e.target.value })} readOnly={readonly} />
          </div>
        </div>

        <Separator />

        {/* Income */}
        <div className="grid grid-cols-2 gap-4">
          <SAMoneyField label="Turnover" value={data.turnover || 0} onChange={(v) => update({ turnover: v })} readonly={readonly} bold />
          <SAMoneyField label="Other Business Income" value={data.other_business_income || 0} onChange={(v) => update({ other_business_income: v })} readonly={readonly} />
        </div>

        <Separator />

        {/* Expenses */}
        <h4 className="font-medium text-sm">Expenses</h4>
        <div className="grid grid-cols-3 gap-4">
          <SAMoneyField label="Cost of Goods" value={data.cost_of_goods || 0} onChange={(v) => update({ cost_of_goods: v })} readonly={readonly} />
          <SAMoneyField label="Wages & Salaries" value={data.wages_salaries || 0} onChange={(v) => update({ wages_salaries: v })} readonly={readonly} />
          <SAMoneyField label="Premises Costs" value={data.premises_costs || 0} onChange={(v) => update({ premises_costs: v })} readonly={readonly} />
          <SAMoneyField label="Repairs & Maintenance" value={data.repairs_maintenance || 0} onChange={(v) => update({ repairs_maintenance: v })} readonly={readonly} />
          <SAMoneyField label="General Admin" value={data.general_admin || 0} onChange={(v) => update({ general_admin: v })} readonly={readonly} />
          <SAMoneyField label="Motor Expenses" value={data.motor_expenses || 0} onChange={(v) => update({ motor_expenses: v })} readonly={readonly} />
          <SAMoneyField label="Travel & Subsistence" value={data.travel_subsistence || 0} onChange={(v) => update({ travel_subsistence: v })} readonly={readonly} />
          <SAMoneyField label="Advertising" value={data.advertising || 0} onChange={(v) => update({ advertising: v })} readonly={readonly} />
          <SAMoneyField label="Entertainment" value={data.entertainment || 0} onChange={(v) => update({ entertainment: v })} readonly={readonly} />
          <SAMoneyField label="Legal & Professional" value={data.legal_professional || 0} onChange={(v) => update({ legal_professional: v })} readonly={readonly} />
          <SAMoneyField label="Interest & Bank Charges" value={data.interest_bank_charges || 0} onChange={(v) => update({ interest_bank_charges: v })} readonly={readonly} />
          <SAMoneyField label="Accountancy Fees" value={data.accountancy_fees || 0} onChange={(v) => update({ accountancy_fees: v })} readonly={readonly} />
          <SAMoneyField label="Depreciation" value={data.depreciation || 0} onChange={(v) => update({ depreciation: v })} readonly={readonly} />
          <SAMoneyField label="Other Expenses" value={data.other_expenses || 0} onChange={(v) => update({ other_expenses: v })} readonly={readonly} />
        </div>

        <Separator />

        {/* Totals */}
        <div className="grid grid-cols-3 gap-4">
          <SAMoneyField label="Total Expenses" value={data.total_expenses || 0} readonly bold />
          <SAMoneyField label="Net Profit" value={data.net_profit || 0} readonly bold />
          <SAMoneyField label="Adjusted Profit" value={data.adjusted_profit || 0} readonly bold />
        </div>

        <Separator />

        {/* Capital allowances & losses */}
        <div className="grid grid-cols-3 gap-4">
          <SAMoneyField label="Capital Allowances" value={data.capital_allowances || 0} onChange={(v) => update({ capital_allowances: v })} readonly={readonly} />
          <SAMoneyField label="Balancing Charges" value={data.balancing_charges || 0} onChange={(v) => update({ balancing_charges: v })} readonly={readonly} />
          <SAMoneyField label="Goods for Personal Use" value={data.goods_for_personal_use || 0} onChange={(v) => update({ goods_for_personal_use: v })} readonly={readonly} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <SAMoneyField label="Loss Brought Forward" value={data.loss_brought_forward || 0} onChange={(v) => update({ loss_brought_forward: v })} readonly={readonly} />
          <SAMoneyField label="Loss Carry Back Claim" value={data.loss_carry_back_claim || 0} onChange={(v) => update({ loss_carry_back_claim: v })} readonly={readonly} />
          <SAMoneyField label="Loss Carry Forward" value={data.loss_carry_forward || 0} readonly />
        </div>
      </CardContent>
    </Card>
  );
}
