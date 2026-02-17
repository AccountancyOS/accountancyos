import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { SAMoneyField } from "./SAMoneyField";
import type { EmploymentEntry } from "@/types/filing-schemas";

interface Props {
  entries: EmploymentEntry[];
  onChange: (entries: EmploymentEntry[]) => void;
  readonly?: boolean;
}

const emptyEntry = (): EmploymentEntry => ({
  employer_name: '', employer_paye_ref: '', gross_pay: 0, tax_deducted: 0,
  benefits_in_kind: 0, employee_pension_contributions: 0, expenses: 0,
});

export function EmploymentScheduleEditor({ entries, onChange, readonly }: Props) {
  const updateEntry = (idx: number, patch: Partial<EmploymentEntry>) => {
    const updated = entries.map((e, i) => (i === idx ? { ...e, ...patch } : e));
    onChange(updated);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Employment Income</CardTitle>
        {!readonly && (
          <Button size="sm" variant="outline" onClick={() => onChange([...entries, emptyEntry()])}>
            <Plus className="h-4 w-4 mr-1" /> Add Employment
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No employment records added.</p>
        )}
        {entries.map((entry, idx) => (
          <div key={idx} className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">{entry.employer_name || `Employment ${idx + 1}`}</h4>
              {!readonly && (
                <Button size="icon" variant="ghost" onClick={() => onChange(entries.filter((_, i) => i !== idx))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-sm">Employer Name</Label>
                <Input value={entry.employer_name} onChange={(e) => updateEntry(idx, { employer_name: e.target.value })} readOnly={readonly} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">PAYE Reference</Label>
                <Input value={entry.employer_paye_ref || ''} onChange={(e) => updateEntry(idx, { employer_paye_ref: e.target.value })} readOnly={readonly} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <SAMoneyField label="Gross Pay" value={entry.gross_pay} onChange={(v) => updateEntry(idx, { gross_pay: v })} readonly={readonly} />
              <SAMoneyField label="Tax Deducted" value={entry.tax_deducted} onChange={(v) => updateEntry(idx, { tax_deducted: v })} readonly={readonly} />
              <SAMoneyField label="Benefits in Kind" value={entry.benefits_in_kind} onChange={(v) => updateEntry(idx, { benefits_in_kind: v })} readonly={readonly} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <SAMoneyField label="Pension Contributions" value={entry.employee_pension_contributions} onChange={(v) => updateEntry(idx, { employee_pension_contributions: v })} readonly={readonly} />
              <SAMoneyField label="Expenses" value={entry.expenses} onChange={(v) => updateEntry(idx, { expenses: v })} readonly={readonly} />
              <div className="flex items-center gap-2 pt-6">
                <Checkbox checked={entry.is_p45 || false} onCheckedChange={(c) => updateEntry(idx, { is_p45: !!c })} disabled={readonly} />
                <Label className="text-sm">P45 Employment</Label>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
