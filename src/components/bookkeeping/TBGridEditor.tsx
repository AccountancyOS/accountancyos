/**
 * TBGridEditor — Manual trial balance entry + CSV import + ledger pull.
 * Provides an editable grid for creating/editing trial balance data
 * that feeds into workpapers and filings.
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Upload, Database, Save, FileDown } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, getAccountTypeLabel } from "@/lib/bookkeeping-utils";
import Papa from "papaparse";

interface TBGridEditorProps {
  entity: BookkeepingEntity;
  periodStart: string;
  periodEnd: string;
  onSnapshotReady?: (data: TBLineItem[]) => void;
}

export interface TBLineItem {
  account_code: string;
  account_name: string;
  account_type: string;
  account_id?: string;
  debit: number;
  credit: number;
  tax_allowability?: string;
  ct_addback_category?: string | null;
}

export function TBGridEditor({ entity, periodStart, periodEnd, onSnapshotReady }: TBGridEditorProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<TBLineItem[]>([]);
  const [source, setSource] = useState<'manual' | 'ledger' | 'csv'>('manual');
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch accounts for the entity
  const { data: accounts } = useQuery({
    queryKey: ["tb-grid-accounts", organization?.id, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const query = supabase
        .from("bookkeeping_accounts")
        .select("id, code, name, account_type, tax_allowability, ct_addback_category, vat_treatment")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("code");

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  // Pull from ledger
  const pullFromLedger = useCallback(async () => {
    if (!organization?.id) return;

    const ledgerQuery = supabase
      .from("ledger_entries")
      .select(`
        account_id, debit, credit,
        account:bookkeeping_accounts(id, code, name, account_type, tax_allowability, ct_addback_category)
      `)
      .eq("organization_id", organization.id)
      .gte("transaction_date", periodStart)
      .lte("transaction_date", periodEnd);

    if (entity.type === "client") {
      ledgerQuery.eq("client_id", entity.id);
    } else {
      ledgerQuery.eq("company_id", entity.id);
    }

    const { data: entries, error } = await ledgerQuery;
    if (error) {
      toast.error("Failed to pull from ledger", { description: error.message });
      return;
    }

    // Aggregate by account
    const map = new Map<string, TBLineItem>();
    (entries || []).forEach((entry: any) => {
      const acc = entry.account;
      if (!acc) return;
      if (!map.has(acc.id)) {
        map.set(acc.id, {
          account_code: acc.code,
          account_name: acc.name,
          account_type: acc.account_type,
          account_id: acc.id,
          debit: 0,
          credit: 0,
          tax_allowability: acc.tax_allowability,
          ct_addback_category: acc.ct_addback_category,
        });
      }
      const line = map.get(acc.id)!;
      line.debit += entry.debit || 0;
      line.credit += entry.credit || 0;
    });

    const result = Array.from(map.values()).sort((a, b) => a.account_code.localeCompare(b.account_code));
    setLines(result);
    setSource('ledger');
    toast.success(`Pulled ${result.length} accounts from ledger`);
  }, [organization?.id, entity, periodStart, periodEnd]);

  // CSV import
  const handleCsvImport = useCallback(() => {
    if (!csvText.trim()) return;

    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const imported: TBLineItem[] = result.data.map((row: any) => ({
          account_code: row.code || row.account_code || row.Code || '',
          account_name: row.name || row.account_name || row.Name || row.Account || '',
          account_type: row.type || row.account_type || row.Type || 'EXPENSE',
          debit: parseFloat(row.debit || row.Debit || row.dr || row.Dr || '0') || 0,
          credit: parseFloat(row.credit || row.Credit || row.cr || row.Cr || '0') || 0,
        })).filter((l: TBLineItem) => l.account_code || l.account_name);

        // Try to match with existing accounts
        if (accounts) {
          imported.forEach((line) => {
            const match = accounts.find(
              (a) => a.code === line.account_code || a.name.toLowerCase() === line.account_name.toLowerCase()
            );
            if (match) {
              line.account_id = match.id;
              line.account_type = match.account_type;
              line.tax_allowability = match.tax_allowability || undefined;
              line.ct_addback_category = match.ct_addback_category;
            }
          });
        }

        setLines(imported);
        setSource('csv');
        setCsvDialogOpen(false);
        setCsvText("");
        toast.success(`Imported ${imported.length} lines from CSV`);
      },
      error: (err) => {
        toast.error("CSV parse error", { description: err.message });
      },
    });
  }, [csvText, accounts]);

  // Add empty row
  const addLine = useCallback(() => {
    setLines((prev) => [
      ...prev,
      { account_code: '', account_name: '', account_type: 'EXPENSE', debit: 0, credit: 0 },
    ]);
    setSource('manual');
  }, []);

  // Remove row
  const removeLine = useCallback((index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Update row
  const updateLine = useCallback((index: number, field: keyof TBLineItem, value: any) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const updated = { ...line, [field]: value };

        // Auto-match account when code changes
        if (field === 'account_code' && accounts) {
          const match = accounts.find((a) => a.code === value);
          if (match) {
            updated.account_id = match.id;
            updated.account_name = match.name;
            updated.account_type = match.account_type;
            updated.tax_allowability = match.tax_allowability || undefined;
            updated.ct_addback_category = match.ct_addback_category;
          }
        }

        return updated;
      })
    );
  }, [accounts]);

  // Totals
  const totals = useMemo(() => {
    return lines.reduce(
      (acc, l) => ({
        debit: acc.debit + l.debit,
        credit: acc.credit + l.credit,
      }),
      { debit: 0, credit: 0 }
    );
  }, [lines]);

  const isBalanced = Math.abs(totals.debit - totals.credit) < 0.01;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Trial Balance Grid</h3>
          <p className="text-sm text-muted-foreground">
            {periodStart} to {periodEnd} • {entity.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={source === 'ledger' ? 'default' : 'secondary'}>
            {source === 'ledger' ? 'From Ledger' : source === 'csv' ? 'CSV Import' : 'Manual'}
          </Badge>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={pullFromLedger}>
          <Database className="h-3.5 w-3.5 mr-1" /> Pull from Ledger
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCsvDialogOpen(true)}>
          <Upload className="h-3.5 w-3.5 mr-1" /> Import CSV
        </Button>
        <Button variant="outline" size="sm" onClick={addLine}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
        </Button>
        <div className="flex-1" />
        {onSnapshotReady && (
          <Button
            size="sm"
            onClick={() => onSnapshotReady(lines)}
            disabled={lines.length === 0 || !isBalanced}
          >
            <FileDown className="h-3.5 w-3.5 mr-1" /> Send to Workpapers
          </Button>
        )}
      </div>

      {/* Grid */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Account Name</TableHead>
              <TableHead className="w-28">Type</TableHead>
              <TableHead className="text-right w-32">Debit £</TableHead>
              <TableHead className="text-right w-32">Credit £</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  Pull from ledger, import CSV, or add rows manually
                </TableCell>
              </TableRow>
            )}
            {lines.map((line, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Input
                    className="h-8 font-mono"
                    value={line.account_code}
                    onChange={(e) => updateLine(i, 'account_code', e.target.value)}
                    placeholder="0000"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    value={line.account_name}
                    onChange={(e) => updateLine(i, 'account_name', e.target.value)}
                    placeholder="Account name"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={line.account_type}
                    onValueChange={(v) => updateLine(i, 'account_type', v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ASSET">Asset</SelectItem>
                      <SelectItem value="LIABILITY">Liability</SelectItem>
                      <SelectItem value="EQUITY">Equity</SelectItem>
                      <SelectItem value="INCOME">Income</SelectItem>
                      <SelectItem value="EXPENSE">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-right font-mono"
                    type="number"
                    step="0.01"
                    value={line.debit || ''}
                    onChange={(e) => updateLine(i, 'debit', parseFloat(e.target.value) || 0)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-right font-mono"
                    type="number"
                    step="0.01"
                    value={line.credit || ''}
                    onChange={(e) => updateLine(i, 'credit', parseFloat(e.target.value) || 0)}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removeLine(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {lines.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-bold">Totals</TableCell>
                <TableCell className="text-right font-mono font-bold">
                  {formatCurrency(totals.debit)}
                </TableCell>
                <TableCell className="text-right font-mono font-bold">
                  {formatCurrency(totals.credit)}
                </TableCell>
                <TableCell />
              </TableRow>
              <TableRow>
                <TableCell colSpan={3} className="text-right text-sm">
                  Difference
                </TableCell>
                <TableCell colSpan={2} className={`text-right font-mono font-bold ${isBalanced ? 'text-green-600' : 'text-destructive'}`}>
                  {formatCurrency(Math.abs(totals.debit - totals.credit))}
                  {isBalanced ? ' ✓' : ' ✗'}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {/* CSV Import Dialog */}
      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Trial Balance from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste CSV data with columns: code, name, type, debit, credit
            </p>
            <Textarea
              rows={10}
              placeholder={"code,name,type,debit,credit\n0100,Office Equipment,ASSET,5000,0\n0200,Bank Account,ASSET,12000,0"}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCsvImport} disabled={!csvText.trim()}>Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
