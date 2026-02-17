/**
 * COATaxMappingEditor — Edit tax allowability, CT add-back categories,
 * and VAT treatment for chart of accounts entries.
 * These structured columns feed directly into CT600 computation,
 * filing snapshots, and accounts model mapping.
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Save, Search, Filter } from "lucide-react";
import { toast } from "sonner";
import { getAccountTypeLabel } from "@/lib/bookkeeping-utils";

interface COATaxMappingEditorProps {
  entity: BookkeepingEntity;
}

const TAX_ALLOWABILITY_OPTIONS = [
  { value: 'fully_allowable', label: 'Fully Allowable', color: 'bg-green-100 text-green-800' },
  { value: 'partially_allowable', label: 'Partially Allowable', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'disallowable', label: 'Disallowable', color: 'bg-red-100 text-red-800' },
  { value: 'capital', label: 'Capital', color: 'bg-blue-100 text-blue-800' },
  { value: 'not_applicable', label: 'N/A', color: 'bg-muted text-muted-foreground' },
];

const CT_ADDBACK_OPTIONS = [
  { value: '__none__', label: '— None —' },
  { value: 'depreciation', label: 'Depreciation' },
  { value: 'amortisation', label: 'Amortisation' },
  { value: 'entertaining', label: 'Entertaining' },
  { value: 'donations_non_qualifying', label: 'Non-qualifying Donations' },
  { value: 'fines_penalties', label: 'Fines & Penalties' },
  { value: 'legal_non_trade', label: 'Legal (Non-Trade)' },
  { value: 'provisions', label: 'Provisions' },
  { value: 'personal_expenses', label: 'Personal Expenses' },
  { value: 'capital_expenditure', label: 'Capital Expenditure' },
  { value: 'other_disallowable', label: 'Other Disallowable' },
];

const VAT_TREATMENT_OPTIONS = [
  { value: 'standard', label: 'Standard Rated' },
  { value: 'reduced', label: 'Reduced Rate' },
  { value: 'zero_rated', label: 'Zero Rated' },
  { value: 'exempt', label: 'Exempt' },
  { value: 'outside_scope', label: 'Outside Scope' },
  { value: 'reverse_charge', label: 'Reverse Charge' },
  { value: 'not_applicable', label: 'N/A' },
];

type PendingChange = {
  id: string;
  field: string;
  value: string | null;
};

export function COATaxMappingEditor({ entity }: COATaxMappingEditorProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["coa-tax-mapping", organization?.id, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const query = supabase
        .from("bookkeeping_accounts")
        .select("id, code, name, account_type, account_subtype, is_active, tax_allowability, ct_addback_category, vat_treatment")
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

  // Filtered accounts
  const filtered = useMemo(() => {
    if (!accounts) return [];
    return accounts.filter((a) => {
      const matchSearch = !search || 
        a.code.toLowerCase().includes(search.toLowerCase()) ||
        a.name.toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === 'all' || a.account_type === filterType;
      return matchSearch && matchType;
    });
  }, [accounts, search, filterType]);

  // Track a change
  const trackChange = (id: string, field: string, value: string | null) => {
    setPendingChanges((prev) => {
      const existing = prev.findIndex((c) => c.id === id && c.field === field);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { id, field, value };
        return updated;
      }
      return [...prev, { id, field, value }];
    });
  };

  // Get effective value (pending change or original)
  const getEffective = (account: any, field: string): string | null => {
    const pending = pendingChanges.find((c) => c.id === account.id && c.field === field);
    if (pending) return pending.value;
    return account[field];
  };

  // Save all changes
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Group changes by account ID
      const byAccount = new Map<string, Record<string, any>>();
      pendingChanges.forEach((change) => {
        if (!byAccount.has(change.id)) {
          byAccount.set(change.id, {});
        }
        byAccount.get(change.id)![change.field] = change.value;
      });

      // Execute updates
      const promises = Array.from(byAccount.entries()).map(([id, updates]) =>
        supabase
          .from("bookkeeping_accounts")
          .update(updates)
          .eq("id", id)
      );

      const results = await Promise.all(promises);
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        throw new Error(`${errors.length} update(s) failed`);
      }
    },
    onSuccess: () => {
      setPendingChanges([]);
      queryClient.invalidateQueries({ queryKey: ["coa-tax-mapping"] });
      toast.success(`Saved ${pendingChanges.length} change(s)`);
    },
    onError: (err) => {
      toast.error("Save failed", { description: err.message });
    },
  });

  const hasChanges = pendingChanges.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">COA Tax Mapping</h2>
          <p className="text-sm text-muted-foreground">
            Set tax allowability, CT add-back categories, and VAT treatment for {entity.name}
          </p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saveMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving…" : `Save ${pendingChanges.length} Changes`}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40">
            <Filter className="h-3.5 w-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="ASSET">Asset</SelectItem>
            <SelectItem value="LIABILITY">Liability</SelectItem>
            <SelectItem value="EQUITY">Equity</SelectItem>
            <SelectItem value="INCOME">Income</SelectItem>
            <SelectItem value="EXPENSE">Expense</SelectItem>
          </SelectContent>
        </Select>
        {hasChanges && (
          <Badge variant="secondary">{pendingChanges.length} unsaved</Badge>
        )}
      </div>

      {/* Grid */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Code</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="w-24">Type</TableHead>
              <TableHead className="w-44">Tax Allowability</TableHead>
              <TableHead className="w-48">CT Add-Back Category</TableHead>
              <TableHead className="w-40">VAT Treatment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading accounts…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {accounts?.length === 0 ? "No accounts. Seed the chart of accounts first." : "No matching accounts."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((account) => {
                const hasPending = pendingChanges.some((c) => c.id === account.id);
                return (
                  <TableRow key={account.id} className={hasPending ? 'bg-primary/5' : undefined}>
                    <TableCell className="font-mono text-sm">{account.code}</TableCell>
                    <TableCell className="font-medium text-sm">{account.name}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {getAccountTypeLabel(account.account_type)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={getEffective(account, 'tax_allowability') || 'fully_allowable'}
                        onValueChange={(v) => trackChange(account.id, 'tax_allowability', v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TAX_ALLOWABILITY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={getEffective(account, 'ct_addback_category') || '__none__'}
                        onValueChange={(v) => trackChange(account.id, 'ct_addback_category', v === '__none__' ? null : v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CT_ADDBACK_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={getEffective(account, 'vat_treatment') || 'standard'}
                        onValueChange={(v) => trackChange(account.id, 'vat_treatment', v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VAT_TREATMENT_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
