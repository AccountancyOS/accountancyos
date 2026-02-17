/**
 * PartnershipScheduleEditor — full editor for partnership tax returns.
 * Handles income/expenses and partner profit allocations.
 */

import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Save, Plus, Trash2, AlertTriangle, Calculator, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SAMoneyField } from "../sa/SAMoneyField";
import type { PartnershipDraftScheduleData, PartnerAllocation } from "@/types/filing-schemas";
import { computePartnershipTotals, validateAllocations } from "@/lib/partnership-engine";

interface Props {
  draft: PartnershipDraftScheduleData;
  onSave: (data: PartnershipDraftScheduleData) => Promise<void>;
  readonly?: boolean;
}

const emptyAllocation: PartnerAllocation = {
  partner_client_id: '',
  partner_name: '',
  allocation_method: 'percentage',
  percentage: 0,
  computed_profit_share: 0,
  computed_tax_adjustments: {},
};

export function PartnershipScheduleEditor({ draft, onSave, readonly }: Props) {
  const { toast } = useToast();
  const [data, setData] = useState<PartnershipDraftScheduleData>(draft);
  const [saving, setSaving] = useState(false);

  const computed = useMemo(() => computePartnershipTotals(data), [data]);
  const errors = useMemo(() => validateAllocations(computed), [computed]);

  const updateField = useCallback((field: keyof PartnershipDraftScheduleData, value: any) => {
    setData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updatePartnership = useCallback((field: string, value: string) => {
    setData((prev) => ({
      ...prev,
      partnership: { ...prev.partnership, [field]: value },
    }));
  }, []);

  const addPartner = useCallback(() => {
    setData((prev) => ({
      ...prev,
      allocations: [...prev.allocations, { ...emptyAllocation }],
    }));
  }, []);

  const removePartner = useCallback((index: number) => {
    setData((prev) => ({
      ...prev,
      allocations: prev.allocations.filter((_, i) => i !== index),
    }));
  }, []);

  const updatePartner = useCallback((index: number, field: keyof PartnerAllocation, value: any) => {
    setData((prev) => ({
      ...prev,
      allocations: prev.allocations.map((a, i) =>
        i === index ? { ...a, [field]: value } : a
      ),
    }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(computed);
      toast({ title: "Partnership return saved" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      {!readonly && (
        <div className="flex items-center justify-end gap-2">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" /> {saving ? "Saving…" : "Save Draft"}
          </Button>
        </div>
      )}

      {/* Partnership Details */}
      <Card>
        <CardHeader>
          <CardTitle>Partnership Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Partnership Name</Label>
            <Input
              value={data.partnership.partnership_name}
              onChange={(e) => updatePartnership('partnership_name', e.target.value)}
              readOnly={readonly}
            />
          </div>
          <div className="space-y-1">
            <Label>UTR</Label>
            <Input
              value={data.partnership.utr}
              onChange={(e) => updatePartnership('utr', e.target.value)}
              readOnly={readonly}
            />
          </div>
          <div className="space-y-1">
            <Label>Period Start</Label>
            <Input
              type="date"
              value={data.partnership.period_start}
              onChange={(e) => updatePartnership('period_start', e.target.value)}
              readOnly={readonly}
            />
          </div>
          <div className="space-y-1">
            <Label>Period End</Label>
            <Input
              type="date"
              value={data.partnership.period_end}
              onChange={(e) => updatePartnership('period_end', e.target.value)}
              readOnly={readonly}
            />
          </div>
        </CardContent>
      </Card>

      {/* Income & Expenses */}
      <Card>
        <CardHeader>
          <CardTitle>Income & Expenses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <SAMoneyField label="Turnover" value={data.turnover} onChange={(v) => updateField('turnover', v)} readonly={readonly} bold />
            <SAMoneyField label="Total Expenses" value={data.total_expenses} onChange={(v) => updateField('total_expenses', v)} readonly={readonly} />
          </div>
          <SAMoneyField label="Net Profit" value={computed.net_profit} readonly bold />
          <div className="grid grid-cols-2 gap-4">
            <SAMoneyField label="Disallowable Expenses" value={data.disallowable_expenses} onChange={(v) => updateField('disallowable_expenses', v)} readonly={readonly} />
            <SAMoneyField label="Capital Allowances" value={data.capital_allowances} onChange={(v) => updateField('capital_allowances', v)} readonly={readonly} />
          </div>
          <SAMoneyField label="Adjusted Profit" value={computed.adjusted_profit} readonly bold />
        </CardContent>
      </Card>

      {/* Partner Allocations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Partner Allocations
            </CardTitle>
            <CardDescription>
              Allocations are stored as references — individual SA returns read from here at computation time
            </CardDescription>
          </div>
          {!readonly && (
            <Button size="sm" variant="outline" onClick={addPartner}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Partner
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {errors.length > 0 && (
            <div className="mb-4 p-3 rounded-lg border border-destructive/50 bg-destructive/10">
              {errors.map((err, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  {err}
                </div>
              ))}
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner Name</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Fixed £</TableHead>
                <TableHead className="text-right">Profit Share £</TableHead>
                {!readonly && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {computed.allocations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={readonly ? 5 : 6} className="text-center text-muted-foreground py-8">
                    No partners added yet
                  </TableCell>
                </TableRow>
              )}
              {computed.allocations.map((alloc, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Input
                      value={alloc.partner_name}
                      onChange={(e) => updatePartner(i, 'partner_name', e.target.value)}
                      readOnly={readonly}
                      className="h-8"
                      placeholder="Partner name"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={alloc.allocation_method}
                      onValueChange={(v) => updatePartner(i, 'allocation_method', v)}
                      disabled={readonly}
                    >
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="fixed">Fixed</SelectItem>
                        <SelectItem value="special">Special</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    {alloc.allocation_method === 'percentage' ? (
                      <Input
                        type="number"
                        step="0.01"
                        value={alloc.percentage || 0}
                        onChange={(e) => updatePartner(i, 'percentage', parseFloat(e.target.value) || 0)}
                        readOnly={readonly}
                        className="h-8 w-20 text-right ml-auto"
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {alloc.allocation_method === 'fixed' ? (
                      <Input
                        type="number"
                        step="0.01"
                        value={alloc.fixed_amount || 0}
                        onChange={(e) => updatePartner(i, 'fixed_amount', parseFloat(e.target.value) || 0)}
                        readOnly={readonly}
                        className="h-8 w-24 text-right ml-auto"
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    £{alloc.computed_profit_share.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </TableCell>
                  {!readonly && (
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => removePartner(i)} className="h-7 w-7">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {/* Totals row */}
              {computed.allocations.length > 0 && (
                <TableRow className="font-semibold border-t-2">
                  <TableCell colSpan={4} className="text-right">Total Allocated</TableCell>
                  <TableCell className="text-right">
                    £{computed.allocations
                      .reduce((sum, a) => sum + a.computed_profit_share, 0)
                      .toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </TableCell>
                  {!readonly && <TableCell />}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Partnership Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Turnover</p>
              <p className="text-xl font-bold">£{computed.turnover.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Adjusted Profit</p>
              <p className="text-xl font-bold">£{computed.adjusted_profit.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Partners</p>
              <p className="text-xl font-bold">{computed.allocations.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
