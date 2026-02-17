/**
 * Grouped simple schedule editors for Dividends, Interest, Unit Trust, Pension.
 * These follow the same pattern: a card with labelled money fields.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SAMoneyField } from "./SAMoneyField";
import type { DividendsSchedule, InterestSchedule, UnitTrustIncomeSchedule, PensionIncomeSchedule, ReliefsSchedule } from "@/types/filing-schemas";

// ==================== DIVIDENDS ====================

export function DividendsScheduleEditor({ data, onChange, readonly }: { data: DividendsSchedule; onChange: (d: DividendsSchedule) => void; readonly?: boolean }) {
  const u = (p: Partial<DividendsSchedule>) => onChange({ ...data, ...p });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Dividends</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <SAMoneyField label="UK Dividends" value={data.uk_dividends || 0} onChange={(v) => u({ uk_dividends: v })} readonly={readonly} />
        <SAMoneyField label="Foreign Dividends" value={data.foreign_dividends || 0} onChange={(v) => u({ foreign_dividends: v })} readonly={readonly} />
        <SAMoneyField label="Foreign Tax Paid" value={data.foreign_tax_paid || 0} onChange={(v) => u({ foreign_tax_paid: v })} readonly={readonly} />
        <SAMoneyField label="Total Dividends" value={data.total_dividends || 0} readonly bold />
      </CardContent>
    </Card>
  );
}

// ==================== INTEREST ====================

export function InterestScheduleEditor({ data, onChange, readonly }: { data: InterestSchedule; onChange: (d: InterestSchedule) => void; readonly?: boolean }) {
  const u = (p: Partial<InterestSchedule>) => onChange({ ...data, ...p });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Interest Income</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <SAMoneyField label="UK Bank Interest" value={data.uk_bank_interest || 0} onChange={(v) => u({ uk_bank_interest: v })} readonly={readonly} />
        <SAMoneyField label="UK Building Society Interest" value={data.uk_building_society_interest || 0} onChange={(v) => u({ uk_building_society_interest: v })} readonly={readonly} />
        <SAMoneyField label="UK Other Interest" value={data.uk_other_interest || 0} onChange={(v) => u({ uk_other_interest: v })} readonly={readonly} />
        <SAMoneyField label="Foreign Interest" value={data.foreign_interest || 0} onChange={(v) => u({ foreign_interest: v })} readonly={readonly} />
        <SAMoneyField label="Foreign Tax Paid" value={data.foreign_tax_paid || 0} onChange={(v) => u({ foreign_tax_paid: v })} readonly={readonly} />
        <SAMoneyField label="Total Interest" value={data.total_interest || 0} readonly bold />
      </CardContent>
    </Card>
  );
}

// ==================== UNIT TRUST ====================

export function UnitTrustScheduleEditor({ data, onChange, readonly }: { data: UnitTrustIncomeSchedule; onChange: (d: UnitTrustIncomeSchedule) => void; readonly?: boolean }) {
  const u = (p: Partial<UnitTrustIncomeSchedule>) => onChange({ ...data, ...p });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Unit Trust Income</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-3 gap-4">
        <SAMoneyField label="Unit Trust Interest" value={data.unit_trust_interest || 0} onChange={(v) => u({ unit_trust_interest: v })} readonly={readonly} />
        <SAMoneyField label="Unit Trust Dividends" value={data.unit_trust_dividends || 0} onChange={(v) => u({ unit_trust_dividends: v })} readonly={readonly} />
        <SAMoneyField label="Total" value={data.total_unit_trust_income || 0} readonly bold />
      </CardContent>
    </Card>
  );
}

// ==================== PENSION ====================

export function PensionScheduleEditor({ data, onChange, readonly }: { data: PensionIncomeSchedule; onChange: (d: PensionIncomeSchedule) => void; readonly?: boolean }) {
  const u = (p: Partial<PensionIncomeSchedule>) => onChange({ ...data, ...p });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Pension Income</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-3 gap-4">
        <SAMoneyField label="State Pension" value={data.state_pension || 0} onChange={(v) => u({ state_pension: v })} readonly={readonly} />
        <SAMoneyField label="State Pension Lump Sum" value={data.state_pension_lump_sum || 0} onChange={(v) => u({ state_pension_lump_sum: v })} readonly={readonly} />
        <SAMoneyField label="Private Pensions" value={data.private_pensions || 0} onChange={(v) => u({ private_pensions: v })} readonly={readonly} />
        <SAMoneyField label="Tax Deducted" value={data.private_pension_tax_deducted || 0} onChange={(v) => u({ private_pension_tax_deducted: v })} readonly={readonly} />
        <SAMoneyField label="Foreign Pensions" value={data.foreign_pensions || 0} onChange={(v) => u({ foreign_pensions: v })} readonly={readonly} />
        <SAMoneyField label="Total Pension Income" value={data.total_pension_income || 0} readonly bold />
      </CardContent>
    </Card>
  );
}

// ==================== RELIEFS ====================

export function ReliefsScheduleEditor({ data, onChange, readonly }: { data: ReliefsSchedule; onChange: (d: ReliefsSchedule) => void; readonly?: boolean }) {
  const u = (p: Partial<ReliefsSchedule>) => onChange({ ...data, ...p });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Reliefs & Deductions</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-3 gap-4">
        <SAMoneyField label="Gift Aid Payments" value={data.gift_aid_payments || 0} onChange={(v) => u({ gift_aid_payments: v })} readonly={readonly} />
        <SAMoneyField label="Gift Aid Carry Back" value={data.gift_aid_carry_back || 0} onChange={(v) => u({ gift_aid_carry_back: v })} readonly={readonly} />
        <SAMoneyField label="Pension (RAS)" value={data.pension_contributions_ras || 0} onChange={(v) => u({ pension_contributions_ras: v })} readonly={readonly} />
        <SAMoneyField label="Pension (Net Pay)" value={data.pension_contributions_net_pay || 0} onChange={(v) => u({ pension_contributions_net_pay: v })} readonly={readonly} />
        <SAMoneyField label="EIS Relief" value={data.eis_relief || 0} onChange={(v) => u({ eis_relief: v })} readonly={readonly} />
        <SAMoneyField label="SEIS Relief" value={data.seis_relief || 0} onChange={(v) => u({ seis_relief: v })} readonly={readonly} />
        <SAMoneyField label="VCT Relief" value={data.vct_relief || 0} onChange={(v) => u({ vct_relief: v })} readonly={readonly} />
        <SAMoneyField label="Community Investment" value={data.community_investment_relief || 0} onChange={(v) => u({ community_investment_relief: v })} readonly={readonly} />
        <SAMoneyField label="Other Reliefs" value={data.other_reliefs || 0} onChange={(v) => u({ other_reliefs: v })} readonly={readonly} />
        <SAMoneyField label="Total Reliefs" value={data.total_reliefs || 0} readonly bold />
      </CardContent>
    </Card>
  );
}
