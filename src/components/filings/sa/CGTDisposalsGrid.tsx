/**
 * CGTDisposalsGrid — editable grid for all CGT disposals (manual + crypto-generated).
 * Supports adding manual disposals and viewing crypto-computed entries.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import type { CGTDisposalEntry, CGTSchedule } from "@/types/filing-schemas";
import { SAMoneyField } from "./SAMoneyField";

interface Props {
  schedule: CGTSchedule;
  onChange: (schedule: CGTSchedule) => void;
  readonly?: boolean;
}

const EMPTY_DISPOSAL: CGTDisposalEntry = {
  asset_description: '',
  asset_type: 'other',
  acquisition_date: '',
  disposal_date: '',
  disposal_proceeds: 0,
  allowable_costs: 0,
  gain_or_loss: 0,
  is_residential_property: false,
};

export function CGTDisposalsGrid({ schedule, onChange, readonly }: Props) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const disposals = schedule.disposals || [];
  const manualDisposals = disposals.filter(d => d.asset_type !== 'crypto');
  const cryptoDisposals = disposals.filter(d => d.asset_type === 'crypto');

  const addDisposal = () => {
    const updated = [...disposals, { ...EMPTY_DISPOSAL }];
    onChange({ ...schedule, disposals: updated });
    setEditingIdx(updated.length - 1);
  };

  const removeDisposal = (idx: number) => {
    const updated = disposals.filter((_, i) => i !== idx);
    onChange({ ...schedule, disposals: updated });
    setEditingIdx(null);
  };

  const updateDisposal = (idx: number, field: keyof CGTDisposalEntry, value: any) => {
    const updated = [...disposals];
    updated[idx] = { ...updated[idx], [field]: value };
    // Auto-compute gain/loss
    if (['disposal_proceeds', 'allowable_costs'].includes(field)) {
      updated[idx].gain_or_loss = (updated[idx].disposal_proceeds || 0) - (updated[idx].allowable_costs || 0);
    }
    onChange({ ...schedule, disposals: updated });
  };

  const formatMoney = (v: number) => {
    const abs = Math.abs(v);
    const formatted = abs.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v < 0 ? `(£${formatted})` : `£${formatted}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Capital Gains Disposals</CardTitle>
        {!readonly && (
          <Button size="sm" variant="outline" onClick={addDisposal}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Disposal
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {disposals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No disposals recorded. Add manual disposals or import crypto transactions.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px]">Asset</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Acquired</TableHead>
                  <TableHead>Disposed</TableHead>
                  <TableHead className="text-right">Proceeds</TableHead>
                  <TableHead className="text-right">Costs</TableHead>
                  <TableHead className="text-right">Gain/Loss</TableHead>
                  {!readonly && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {disposals.map((d, idx) => (
                  <TableRow key={idx} className={d.asset_type === 'crypto' ? 'bg-muted/30' : ''}>
                    <TableCell>
                      {!readonly && d.asset_type !== 'crypto' ? (
                        <Input
                          value={d.asset_description}
                          onChange={(e) => updateDisposal(idx, 'asset_description', e.target.value)}
                          className="h-8 text-sm"
                          placeholder="Description"
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{d.asset_description}</span>
                          {d.asset_type === 'crypto' && d.token_symbol && (
                            <Badge variant="secondary" className="text-xs">{d.token_symbol}</Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {!readonly && d.asset_type !== 'crypto' ? (
                        <Select value={d.asset_type} onValueChange={(v) => updateDisposal(idx, 'asset_type', v)}>
                          <SelectTrigger className="h-8 text-sm w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="property">Property</SelectItem>
                            <SelectItem value="shares">Shares</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className="text-xs capitalize">{d.asset_type}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!readonly && d.asset_type !== 'crypto' ? (
                        <Input type="date" value={d.acquisition_date} onChange={(e) => updateDisposal(idx, 'acquisition_date', e.target.value)} className="h-8 text-sm w-32" />
                      ) : (
                        <span className="text-sm">{d.acquisition_date || '—'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {!readonly && d.asset_type !== 'crypto' ? (
                        <Input type="date" value={d.disposal_date} onChange={(e) => updateDisposal(idx, 'disposal_date', e.target.value)} className="h-8 text-sm w-32" />
                      ) : (
                        <span className="text-sm">{d.disposal_date}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!readonly && d.asset_type !== 'crypto' ? (
                        <Input type="number" value={d.disposal_proceeds || ''} onChange={(e) => updateDisposal(idx, 'disposal_proceeds', parseFloat(e.target.value) || 0)} className="h-8 text-sm text-right w-28" />
                      ) : (
                        <span className="text-sm">{formatMoney(d.disposal_proceeds)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!readonly && d.asset_type !== 'crypto' ? (
                        <Input type="number" value={d.allowable_costs || ''} onChange={(e) => updateDisposal(idx, 'allowable_costs', parseFloat(e.target.value) || 0)} className="h-8 text-sm text-right w-28" />
                      ) : (
                        <span className="text-sm">{formatMoney(d.allowable_costs)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`text-sm font-medium ${d.gain_or_loss < 0 ? 'text-destructive' : 'text-green-600'}`}>
                        {formatMoney(d.gain_or_loss)}
                      </span>
                    </TableCell>
                    {!readonly && (
                      <TableCell>
                        {d.asset_type !== 'crypto' && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeDisposal(idx)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Summary */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-muted/50 rounded-lg">
          <div>
            <Label className="text-xs text-muted-foreground">Total Gains</Label>
            <p className="text-sm font-semibold text-green-600">{formatMoney(schedule.total_gains)}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Total Losses</Label>
            <p className="text-sm font-semibold text-destructive">{formatMoney(schedule.total_losses)}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Annual Exempt Amount</Label>
            <SAMoneyField
              label=""
              value={schedule.annual_exempt_amount}
              onChange={(v) => onChange({ ...schedule, annual_exempt_amount: v })}
              readonly={readonly}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Taxable Gains</Label>
            <p className="text-sm font-bold">{formatMoney(schedule.taxable_gains)}</p>
          </div>
        </div>

        {/* Losses */}
        <div className="mt-3 grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg">
          <div>
            <Label className="text-xs text-muted-foreground">Losses B/F Used</Label>
            <SAMoneyField
              label=""
              value={schedule.losses_brought_forward_used}
              onChange={(v) => onChange({ ...schedule, losses_brought_forward_used: v })}
              readonly={readonly}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Losses C/F</Label>
            <p className="text-sm font-semibold">{formatMoney(schedule.losses_carried_forward)}</p>
          </div>
        </div>

        {/* Crypto summary */}
        {schedule.crypto_disposals_count > 0 && (
          <div className="mt-3 p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Crypto Summary</p>
            <div className="flex gap-4">
              <span className="text-sm">{schedule.crypto_disposals_count} disposals</span>
              <span className="text-sm font-medium text-green-600">Gains: {formatMoney(schedule.crypto_total_gains)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
