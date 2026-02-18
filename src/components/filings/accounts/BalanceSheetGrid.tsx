/**
 * Editable Balance Sheet Grid with line-level provenance.
 * Each line shows: label, current value, provenance badge (derived/override), prior year.
 */
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { FRS105BalanceSheetDraft, FRS105PriorPeriod, BalanceSheetLineValue } from "@/types/filing-schemas";

interface BalanceSheetGridProps {
  balanceSheet: FRS105BalanceSheetDraft;
  priorPeriod?: FRS105PriorPeriod;
  onChange: (bs: FRS105BalanceSheetDraft) => void;
  readonly: boolean;
}

const LINE_DEFS: { key: keyof Pick<FRS105BalanceSheetDraft, 'tangible_assets' | 'debtors' | 'cash_at_bank' | 'creditors_within_one_year' | 'creditors_after_one_year' | 'share_capital' | 'retained_earnings'>; label: string; section: string }[] = [
  { key: 'tangible_assets', label: 'Tangible assets', section: 'Fixed Assets' },
  { key: 'debtors', label: 'Debtors', section: 'Current Assets' },
  { key: 'cash_at_bank', label: 'Cash at bank and in hand', section: 'Current Assets' },
  { key: 'creditors_within_one_year', label: 'Creditors: within one year', section: 'Creditors' },
  { key: 'creditors_after_one_year', label: 'Creditors: after one year', section: 'Creditors' },
  { key: 'share_capital', label: 'Called up share capital', section: 'Capital & Reserves' },
  { key: 'retained_earnings', label: 'Profit and loss account', section: 'Capital & Reserves' },
];

export function BalanceSheetGrid({ balanceSheet, priorPeriod, onChange, readonly }: BalanceSheetGridProps) {
  const updateLine = (key: string, value: number) => {
    const lineKey = key as keyof typeof balanceSheet;
    const current = balanceSheet[lineKey] as BalanceSheetLineValue;
    onChange({
      ...balanceSheet,
      [key]: { ...current, amount: value, source: 'manual_override' as const },
    });
  };

  let lastSection = '';

  const fmt = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 w-1/3">Line</th>
            <th className="text-right py-2 w-32">Amount (£)</th>
            <th className="text-center py-2 w-24">Source</th>
            {priorPeriod && <th className="text-right py-2 w-32">Prior (£)</th>}
          </tr>
        </thead>
        <tbody>
          {LINE_DEFS.map(({ key, label, section }) => {
            const line = balanceSheet[key] as BalanceSheetLineValue;
            const showSection = section !== lastSection;
            lastSection = section;
            const ppLine = priorPeriod ? (priorPeriod as any)[key] as BalanceSheetLineValue | undefined : undefined;

            return (
              <>
                {showSection && (
                  <tr key={`section-${section}`}>
                    <td colSpan={priorPeriod ? 4 : 3} className="pt-4 pb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                      {section}
                    </td>
                  </tr>
                )}
                <tr key={key} className="border-b border-border/50">
                  <td className="py-2">{label}</td>
                  <td className="text-right py-2">
                    {readonly ? (
                      <span>{fmt(line?.amount ?? 0)}</span>
                    ) : (
                      <Input
                        type="number"
                        step="0.01"
                        value={line?.amount ?? 0}
                        onChange={(e) => updateLine(key, parseFloat(e.target.value) || 0)}
                        className="w-32 text-right h-8 ml-auto"
                      />
                    )}
                  </td>
                  <td className="text-center py-2">
                    <Badge variant={line?.source === 'derived' ? 'secondary' : 'outline'} className="text-xs">
                      {line?.source === 'derived' ? 'TB' : 'Manual'}
                    </Badge>
                  </td>
                  {priorPeriod && (
                    <td className="text-right py-2 text-muted-foreground">
                      {ppLine ? fmt(ppLine.amount) : '—'}
                    </td>
                  )}
                </tr>
              </>
            );
          })}
        </tbody>
      </table>

      {/* Computed totals */}
      <div className="mt-4 pt-4 border-t space-y-2 text-sm">
        <div className="flex justify-between"><span>Net Current Assets</span><span className="font-medium">{fmt(balanceSheet.net_current_assets)}</span></div>
        <div className="flex justify-between"><span>Total Assets Less Current Liabilities</span><span className="font-medium">{fmt(balanceSheet.total_assets_less_current_liabilities)}</span></div>
        <div className="flex justify-between font-semibold border-t pt-2"><span>Net Assets</span><span>{fmt(balanceSheet.net_assets)}</span></div>
        <div className="flex justify-between font-semibold"><span>Total Equity</span><span>{fmt(balanceSheet.total_equity)}</span></div>
        {Math.abs(balanceSheet.net_assets - balanceSheet.total_equity) > 0.01 && (
          <p className="text-destructive text-xs mt-2">⚠ Balance sheet does not balance: Net Assets ≠ Total Equity</p>
        )}
      </div>
    </div>
  );
}
