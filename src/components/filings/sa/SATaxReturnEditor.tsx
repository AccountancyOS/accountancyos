/**
 * SATaxReturnEditor — master component for editing a full SA Non-MTD tax return.
 * Renders enabled schedule modules, computes totals, and shows live SA302.
 */

import { useState, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Save, Calculator, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { SADraftScheduleData } from "@/types/filing-schemas";
import { computeSAScheduleTotals, type SAScheduleModuleKey } from "@/lib/sa-schedule-engine";
import { renderSA302 } from "@/lib/sa302-renderer";
import { computeCryptoDisposals, buildCGTSchedule, type CryptoTransaction } from "@/lib/cgt-crypto-engine";
import { SAScheduleModuleToggle } from "./SAScheduleModuleToggle";
import { EmploymentScheduleEditor } from "./EmploymentScheduleEditor";
import { SelfEmploymentScheduleEditor } from "./SelfEmploymentScheduleEditor";
import { DividendsScheduleEditor, InterestScheduleEditor, UnitTrustScheduleEditor, PensionScheduleEditor, ReliefsScheduleEditor } from "./SimpleScheduleEditors";
import { AdjustmentsScheduleEditor } from "./AdjustmentsScheduleEditor";
import { SA302View } from "./SA302View";
import { CGTDisposalsGrid } from "./CGTDisposalsGrid";
import { CryptoImportDialog } from "./CryptoImportDialog";
import { CryptoPoolsView } from "./CryptoPoolsView";

interface Props {
  draft: SADraftScheduleData;
  onSave: (data: SADraftScheduleData) => Promise<void>;
  readonly?: boolean;
}

export function SATaxReturnEditor({ draft, onSave, readonly }: Props) {
  const { toast } = useToast();
  const [data, setData] = useState<SADraftScheduleData>(draft);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("schedules");
  const [cryptoTxs, setCryptoTxs] = useState<CryptoTransaction[]>([]);
  const [showCryptoImport, setShowCryptoImport] = useState(false);

  // Determine which modules are enabled (have data)
  const enabledModules = useMemo<SAScheduleModuleKey[]>(() => {
    const modules: SAScheduleModuleKey[] = [];
    if (data.employment) modules.push('employment');
    if (data.self_employment) modules.push('self_employment');
    if (data.property) modules.push('property');
    if (data.dividends) modules.push('dividends');
    if (data.interest) modules.push('interest');
    if (data.unit_trust_income) modules.push('unit_trust_income');
    if (data.pension_income) modules.push('pension_income');
    if (data.chargeable_event_gains) modules.push('chargeable_event_gains');
    if (data.trust_estate_income) modules.push('trust_estate_income');
    if (data.cgt) modules.push('cgt');
    if (data.reliefs) modules.push('reliefs');
    if (data.adjustments) modules.push('adjustments');
    return modules;
  }, [data]);

  const handleToggle = useCallback((key: SAScheduleModuleKey, enabled: boolean) => {
    setData((prev) => {
      const next = { ...prev };
      if (enabled) {
        // Initialize with empty defaults
        const defaults: Record<string, any> = {
          employment: { entries: [] },
          self_employment: { business_name: '', accounting_period_start: '', accounting_period_end: '', turnover: 0, other_business_income: 0, cost_of_goods: 0, wages_salaries: 0, premises_costs: 0, repairs_maintenance: 0, general_admin: 0, motor_expenses: 0, travel_subsistence: 0, advertising: 0, entertainment: 0, legal_professional: 0, interest_bank_charges: 0, accountancy_fees: 0, depreciation: 0, other_expenses: 0, total_expenses: 0, net_profit: 0, capital_allowances: 0, balancing_charges: 0, goods_for_personal_use: 0, loss_brought_forward: 0, loss_carry_back_claim: 0, loss_carry_forward: 0, adjusted_profit: 0 },
          property: { uk_properties: [], overseas_properties: [], uk_total_profit: 0, overseas_total_profit: 0, mortgage_interest_restriction: 0, basic_rate_tax_reduction: 0 },
          dividends: { uk_dividends: 0, foreign_dividends: 0, foreign_tax_paid: 0, total_dividends: 0 },
          interest: { uk_bank_interest: 0, uk_building_society_interest: 0, uk_other_interest: 0, foreign_interest: 0, foreign_tax_paid: 0, total_interest: 0 },
          unit_trust_income: { unit_trust_interest: 0, unit_trust_dividends: 0, total_unit_trust_income: 0 },
          pension_income: { state_pension: 0, state_pension_lump_sum: 0, private_pensions: 0, private_pension_tax_deducted: 0, foreign_pensions: 0, total_pension_income: 0 },
          chargeable_event_gains: { events: [], total_gains: 0, total_tax_treated_as_paid: 0 },
          trust_estate_income: { entries: [], total_income: 0, total_tax_paid: 0 },
          cgt: { disposals: [], total_gains: 0, total_losses: 0, net_gains: 0, annual_exempt_amount: 0, taxable_gains: 0, losses_brought_forward_used: 0, losses_carried_forward: 0, crypto_disposals_count: 0, crypto_total_gains: 0 },
          reliefs: { gift_aid_payments: 0, gift_aid_carry_back: 0, pension_contributions_ras: 0, pension_contributions_net_pay: 0, eis_relief: 0, seis_relief: 0, vct_relief: 0, community_investment_relief: 0, other_reliefs: 0, total_reliefs: 0 },
          adjustments: { student_loan_plan_type: [], student_loan_deductions: 0, hicbc_applicable: false, hicbc_charge: 0, marriage_allowance_transfer: 'none' as const, marriage_allowance_amount: 0, underpaid_tax_coded_out: 0, poa_reduction_claimed: 0, poa_first_payment: 0, poa_second_payment: 0, annual_allowance_charge: 0, scheme_pays_election: false },
        };
        (next as any)[key] = defaults[key];
      } else {
        delete (next as any)[key];
      }
      return next;
    });
  }, []);

  // Computed totals and SA302
  const computed = useMemo(() => computeSAScheduleTotals(data), [data]);
  const sa302 = useMemo(() => renderSA302(computed), [computed]);

  // Crypto computation
  const cryptoResult = useMemo(() => {
    if (cryptoTxs.length === 0) return null;
    return computeCryptoDisposals(cryptoTxs);
  }, [cryptoTxs]);

  // Handle crypto import — merge computed disposals into CGT schedule
  const handleCryptoImport = useCallback((txs: CryptoTransaction[]) => {
    setCryptoTxs((prev) => [...prev, ...txs]);
  }, []);

  // When crypto result changes, rebuild CGT schedule
  useMemo(() => {
    if (!cryptoResult || !data.cgt) return;
    const manualDisposals = (data.cgt.disposals || []).filter(d => d.asset_type !== 'crypto');
    const updated = buildCGTSchedule(
      cryptoResult,
      manualDisposals,
      data.cgt.annual_exempt_amount || 0,
      data.cgt.losses_brought_forward_used || 0
    );
    // Only update if disposals changed
    if (JSON.stringify(updated.disposals) !== JSON.stringify(data.cgt.disposals)) {
      setData((prev) => ({ ...prev, cgt: updated }));
    }
  }, [cryptoResult]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const toSave = computeSAScheduleTotals(data);
      await onSave(toSave);
      toast({ title: "Draft saved" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {!readonly && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => setActiveTab("sa302")}>
            <Calculator className="h-4 w-4 mr-2" /> View SA302
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" /> {saving ? "Saving…" : "Save Draft"}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Module toggles sidebar */}
        <div className="lg:col-span-1">
          <SAScheduleModuleToggle enabledModules={enabledModules} onToggle={handleToggle} disabled={readonly} />
        </div>

        {/* Main content area */}
        <div className="lg:col-span-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="schedules">Schedules</TabsTrigger>
              <TabsTrigger value="sa302">SA302 Computation</TabsTrigger>
            </TabsList>

            <TabsContent value="schedules" className="space-y-6 mt-4">
              {enabledModules.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Enable schedule modules from the sidebar to begin.</p>
                </div>
              )}

              {enabledModules.includes('employment') && (
                <EmploymentScheduleEditor
                  entries={computed.employment?.entries || []}
                  onChange={(entries) => setData((prev) => ({ ...prev, employment: { entries } }))}
                  readonly={readonly}
                />
              )}

              {enabledModules.includes('self_employment') && computed.self_employment && (
                <SelfEmploymentScheduleEditor
                  data={computed.self_employment}
                  onChange={(d) => setData((prev) => ({ ...prev, self_employment: d }))}
                  readonly={readonly}
                />
              )}

              {enabledModules.includes('dividends') && computed.dividends && (
                <DividendsScheduleEditor
                  data={computed.dividends}
                  onChange={(d) => setData((prev) => ({ ...prev, dividends: d }))}
                  readonly={readonly}
                />
              )}

              {enabledModules.includes('interest') && computed.interest && (
                <InterestScheduleEditor
                  data={computed.interest}
                  onChange={(d) => setData((prev) => ({ ...prev, interest: d }))}
                  readonly={readonly}
                />
              )}

              {enabledModules.includes('unit_trust_income') && computed.unit_trust_income && (
                <UnitTrustScheduleEditor
                  data={computed.unit_trust_income}
                  onChange={(d) => setData((prev) => ({ ...prev, unit_trust_income: d }))}
                  readonly={readonly}
                />
              )}

              {enabledModules.includes('pension_income') && computed.pension_income && (
                <PensionScheduleEditor
                  data={computed.pension_income}
                  onChange={(d) => setData((prev) => ({ ...prev, pension_income: d }))}
                  readonly={readonly}
                />
              )}

              {enabledModules.includes('reliefs') && computed.reliefs && (
                <ReliefsScheduleEditor
                  data={computed.reliefs}
                  onChange={(d) => setData((prev) => ({ ...prev, reliefs: d }))}
                  readonly={readonly}
                />
              )}

              {enabledModules.includes('adjustments') && computed.adjustments && (
                <AdjustmentsScheduleEditor
                  data={computed.adjustments}
                  onChange={(d) => setData((prev) => ({ ...prev, adjustments: d }))}
                  readonly={readonly}
                />
              )}

              {enabledModules.includes('cgt') && computed.cgt && (
                <div className="space-y-4">
                  <div className="flex items-center justify-end">
                    {!readonly && (
                      <Button size="sm" variant="outline" onClick={() => setShowCryptoImport(true)}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> Import Crypto
                      </Button>
                    )}
                  </div>
                  <CGTDisposalsGrid
                    schedule={computed.cgt}
                    onChange={(cgt) => setData((prev) => ({ ...prev, cgt }))}
                    readonly={readonly}
                  />
                  {cryptoResult && cryptoResult.final_pools.length > 0 && (
                    <CryptoPoolsView pools={cryptoResult.final_pools} />
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="sa302" className="mt-4">
              <SA302View sa302={sa302} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <CryptoImportDialog
        open={showCryptoImport}
        onClose={() => setShowCryptoImport(false)}
        onImport={handleCryptoImport}
      />
    </div>
  );
}
