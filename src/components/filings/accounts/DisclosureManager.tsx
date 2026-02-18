/**
 * Disclosure Manager — System-determined checklist of mandatory disclosures.
 * Users cannot add, remove, or hide disclosures.
 * Status is computed by the system based on ledger/profile data.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, AlertTriangle, Lock, MinusCircle, ChevronDown, ChevronRight } from "lucide-react";
import type { FRS105StructuredDisclosures, DisclosureStatus } from "@/types/filing-schemas";
import { Switch } from "@/components/ui/switch";

interface DisclosureManagerProps {
  disclosures: FRS105StructuredDisclosures;
  onChange: (d: FRS105StructuredDisclosures) => void;
  readonly: boolean;
}

const STATUS_CONFIG: Record<DisclosureStatus, { label: string; color: string; icon: React.ReactNode }> = {
  complete: { label: "Complete", color: "bg-green-500/10 text-green-700", icon: <CheckCircle className="h-3 w-3" /> },
  required_missing: { label: "Required", color: "bg-destructive/10 text-destructive", icon: <AlertTriangle className="h-3 w-3" /> },
  not_required: { label: "N/A", color: "bg-muted text-muted-foreground", icon: <MinusCircle className="h-3 w-3" /> },
  locked: { label: "Locked", color: "bg-blue-500/10 text-blue-700", icon: <Lock className="h-3 w-3" /> },
};

interface DisclosureRowProps {
  title: string;
  status: DisclosureStatus;
  reason?: string;
  children?: React.ReactNode;
  readonly: boolean;
}

function DisclosureRow({ title, status, reason, children, readonly }: DisclosureRowProps) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[status];
  const canOpen = status !== 'locked' && status !== 'not_required' && !readonly;

  return (
    <div className="border rounded-lg">
      <button
        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => canOpen && setOpen(!open)}
        disabled={!canOpen}
      >
        <div className="flex items-center gap-2">
          {canOpen ? (open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="w-4" />}
          <span className="font-medium text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {reason && <span className="text-xs text-muted-foreground max-w-[200px] truncate">{reason}</span>}
          <Badge className={`${cfg.color} flex items-center gap-1`}>
            {cfg.icon} {cfg.label}
          </Badge>
        </div>
      </button>
      {open && children && <div className="p-4 pt-0 border-t">{children}</div>}
    </div>
  );
}

export function DisclosureManager({ disclosures, onChange, readonly }: DisclosureManagerProps) {
  const d = disclosures;

  const patch = (updates: Partial<FRS105StructuredDisclosures>) => {
    onChange({ ...d, ...updates });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">
        Disclosures are determined by the system based on your ledger and client data. All required items must be completed before iXBRL generation.
      </p>

      {/* Statement of compliance — locked */}
      <DisclosureRow title="Statement of Compliance" status="locked" readonly={readonly}>
        <p className="text-sm text-muted-foreground">{d.statement_of_compliance.text}</p>
      </DisclosureRow>

      {/* Average employees */}
      <DisclosureRow title="Average Employees" status={d.average_employees.status} readonly={readonly}>
        <div className="space-y-3 pt-3">
          <div className="flex items-center gap-3">
            <Label>Count</Label>
            <Input
              type="number"
              min={0}
              value={d.average_employees.count}
              onChange={(e) => patch({
                average_employees: { ...d.average_employees, count: parseInt(e.target.value) || 0, confirmed: true, status: 'complete' }
              })}
              className="w-24 h-8"
            />
          </div>
          <p className="text-xs text-muted-foreground">Enter 0 if no employees during the period.</p>
        </div>
      </DisclosureRow>

      {/* Directors' Advances */}
      <DisclosureRow title="Directors' Advances/Credits/Guarantees" status={d.directors_advances.status} reason={d.directors_advances.requirement_reason} readonly={readonly}>
        <div className="space-y-3 pt-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={d.directors_advances.confirmed_none}
              onCheckedChange={(v) => patch({
                directors_advances: {
                  ...d.directors_advances,
                  confirmed_none: v,
                  accountant_affirmation: v,
                  entries: v ? [] : d.directors_advances.entries,
                  status: v ? 'complete' : (d.directors_advances.entries.length > 0 ? 'complete' : 'required_missing'),
                }
              })}
            />
            <Label className="text-sm">Confirm: No directors' advances, credits or guarantees</Label>
          </div>
          {!d.directors_advances.confirmed_none && (
            <div className="space-y-2">
              {d.directors_advances.entries.map((entry, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 text-sm">
                  <Input placeholder="Director" value={entry.director_name} onChange={(e) => {
                    const entries = [...d.directors_advances.entries];
                    entries[i] = { ...entry, director_name: e.target.value };
                    patch({ directors_advances: { ...d.directors_advances, entries, status: 'complete' } });
                  }} className="h-8" />
                  <Input type="number" placeholder="Opening" value={entry.opening_balance} onChange={(e) => {
                    const entries = [...d.directors_advances.entries];
                    entries[i] = { ...entry, opening_balance: parseFloat(e.target.value) || 0 };
                    patch({ directors_advances: { ...d.directors_advances, entries, status: 'complete' } });
                  }} className="h-8" />
                  <Input type="number" placeholder="Movement" value={entry.movement} onChange={(e) => {
                    const entries = [...d.directors_advances.entries];
                    entries[i] = { ...entry, movement: parseFloat(e.target.value) || 0 };
                    patch({ directors_advances: { ...d.directors_advances, entries, status: 'complete' } });
                  }} className="h-8" />
                  <Input type="number" placeholder="Closing" value={entry.closing_balance} onChange={(e) => {
                    const entries = [...d.directors_advances.entries];
                    entries[i] = { ...entry, closing_balance: parseFloat(e.target.value) || 0 };
                    patch({ directors_advances: { ...d.directors_advances, entries, status: 'complete' } });
                  }} className="h-8" />
                  <Button variant="ghost" size="sm" onClick={() => {
                    const entries = d.directors_advances.entries.filter((_, j) => j !== i);
                    patch({ directors_advances: { ...d.directors_advances, entries, status: entries.length > 0 ? 'complete' : 'required_missing' } });
                  }}>✕</Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => {
                patch({
                  directors_advances: {
                    ...d.directors_advances,
                    entries: [...d.directors_advances.entries, { director_name: '', opening_balance: 0, movement: 0, closing_balance: 0, interest_rate: null }],
                  }
                });
              }}>+ Add Director</Button>
            </div>
          )}
        </div>
      </DisclosureRow>

      {/* Commitments */}
      <DisclosureRow title="Commitments & Contingent Liabilities" status={d.commitments.status} readonly={readonly}>
        <div className="space-y-3 pt-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={d.commitments.confirmed_none}
              onCheckedChange={(v) => patch({
                commitments: { ...d.commitments, confirmed_none: v, entries: v ? [] : d.commitments.entries, status: v ? 'complete' : 'required_missing' }
              })}
            />
            <Label className="text-sm">Confirm: No commitments or contingent liabilities</Label>
          </div>
        </div>
      </DisclosureRow>

      {/* Off-balance sheet */}
      <DisclosureRow title="Off-Balance Sheet Arrangements" status={d.off_balance_sheet.status} readonly={readonly}>
        <div className="space-y-3 pt-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={d.off_balance_sheet.confirmed_none}
              onCheckedChange={(v) => patch({
                off_balance_sheet: { ...d.off_balance_sheet, confirmed_none: v, status: v ? 'complete' : 'required_missing' }
              })}
            />
            <Label className="text-sm">Confirm: No off-balance sheet arrangements</Label>
          </div>
        </div>
      </DisclosureRow>

      {/* Dividends */}
      <DisclosureRow title="Dividends" status={d.dividends.status} reason={d.dividends.requirement_reason} readonly={readonly}>
        <div className="pt-3">
          <p className="text-xs text-muted-foreground">Add dividend entries if applicable, or confirm none.</p>
          <div className="flex items-center gap-2 mt-2">
            <Switch
              checked={d.dividends.confirmed_none}
              onCheckedChange={(v) => patch({
                dividends: { ...d.dividends, confirmed_none: v, status: v ? 'complete' : 'not_required' }
              })}
            />
            <Label className="text-sm">No dividends declared</Label>
          </div>
        </div>
      </DisclosureRow>

      {/* Related party */}
      <DisclosureRow title="Related Party Transactions" status={d.related_party_transactions.status} reason={d.related_party_transactions.requirement_reason} readonly={readonly}>
        <div className="pt-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={d.related_party_transactions.confirmed_none}
              onCheckedChange={(v) => patch({
                related_party_transactions: { ...d.related_party_transactions, confirmed_none: v, status: v ? 'complete' : 'not_required' }
              })}
            />
            <Label className="text-sm">No related party transactions</Label>
          </div>
        </div>
      </DisclosureRow>

      {/* Going concern */}
      <DisclosureRow title="Going Concern" status={d.going_concern.status} readonly={readonly}>
        <div className="space-y-3 pt-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={d.going_concern.flagged}
              onCheckedChange={(v) => patch({
                going_concern: { ...d.going_concern, flagged: v, status: v ? 'required_missing' : 'not_required' }
              })}
            />
            <Label className="text-sm">Flag going concern uncertainty</Label>
          </div>
          {d.going_concern.flagged && (
            <Input
              placeholder="Describe going concern uncertainty..."
              value={d.going_concern.narrative || ''}
              onChange={(e) => patch({
                going_concern: { ...d.going_concern, narrative: e.target.value, status: e.target.value.trim() ? 'complete' : 'required_missing' }
              })}
            />
          )}
        </div>
      </DisclosureRow>

      {/* Prior period adjustments */}
      <DisclosureRow title="Prior Period Adjustments" status={d.prior_period_adjustments.status} readonly={readonly}>
        <div className="space-y-3 pt-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={d.prior_period_adjustments.flagged}
              onCheckedChange={(v) => patch({
                prior_period_adjustments: { ...d.prior_period_adjustments, flagged: v, status: v ? 'required_missing' : 'not_required' }
              })}
            />
            <Label className="text-sm">Flag prior period adjustments</Label>
          </div>
          {d.prior_period_adjustments.flagged && (
            <div className="space-y-2">
              <Input
                placeholder="Description..."
                value={d.prior_period_adjustments.description || ''}
                onChange={(e) => patch({
                  prior_period_adjustments: {
                    ...d.prior_period_adjustments,
                    description: e.target.value,
                    status: e.target.value.trim() && d.prior_period_adjustments.amount !== undefined ? 'complete' : 'required_missing',
                  }
                })}
              />
              <Input
                type="number"
                placeholder="Amount"
                value={d.prior_period_adjustments.amount ?? ''}
                onChange={(e) => patch({
                  prior_period_adjustments: {
                    ...d.prior_period_adjustments,
                    amount: parseFloat(e.target.value) || 0,
                    status: d.prior_period_adjustments.description?.trim() ? 'complete' : 'required_missing',
                  }
                })}
                className="w-40"
              />
            </div>
          )}
        </div>
      </DisclosureRow>
    </div>
  );
}
