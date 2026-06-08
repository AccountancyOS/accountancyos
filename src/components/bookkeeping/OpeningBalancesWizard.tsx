import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/bookkeeping-utils";

interface OpeningBalancesWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity;
}

/**
 * Opening Balances Wizard — Phase 1.
 *
 * The wizard collects per-account debit / credit balances and posts them
 * through `apply_opening_balances`, which delegates to the hardened
 * `post_to_ledger` RPC. No row is ever inserted into ledger_entries from
 * this component directly.
 */
export function OpeningBalancesWizard({
  open,
  onOpenChange,
  entity,
}: OpeningBalancesWizardProps) {
  const { organization } = useOrganization();
  const qc = useQueryClient();
  const [openingDate, setOpeningDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [lockPeriod, setLockPeriod] = useState(true);
  const [posting, setPosting] = useState(false);
  const [balances, setBalances] = useState<Record<string, { debit: string; credit: string }>>(
    {}
  );

  const { data: accounts = [] } = useQuery({
    queryKey: ["ob-accounts", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const q = supabase
        .from("bookkeeping_accounts")
        .select("id, code, name, account_type")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("code");
      if (entity.type === "client") q.or(`client_id.eq.${entity.id},client_id.is.null`);
      else q.or(`company_id.eq.${entity.id},company_id.is.null`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!organization?.id,
  });

  const totals = useMemo(() => {
    let d = 0;
    let c = 0;
    for (const v of Object.values(balances)) {
      d += parseFloat(v.debit || "0") || 0;
      c += parseFloat(v.credit || "0") || 0;
    }
    return { d, c, diff: Math.round((d - c) * 100) / 100 };
  }, [balances]);

  const update = (id: string, field: "debit" | "credit", v: string) =>
    setBalances((b) => ({
      ...b,
      [id]: { debit: "", credit: "", ...b[id], [field]: v },
    }));

  const handlePost = async () => {
    if (!organization?.id) return;
    const entries = Object.entries(balances)
      .map(([account_id, v]) => {
        const debit = parseFloat(v.debit || "0") || 0;
        const credit = parseFloat(v.credit || "0") || 0;
        if (debit === 0 && credit === 0) return null;
        return debit > 0
          ? { account_id, debit }
          : { account_id, credit };
      })
      .filter(Boolean);

    if (entries.length < 2) {
      toast.error("Enter at least two account balances");
      return;
    }
    if (totals.diff !== 0) {
      toast.error(
        `Opening balances are unbalanced (Dr ${totals.d.toFixed(2)} vs Cr ${totals.c.toFixed(2)})`
      );
      return;
    }

    setPosting(true);
    const { data, error } = await supabase.rpc("apply_opening_balances", {
      p_organization_id: organization.id,
      p_client_id: entity.type === "client" ? entity.id : null,
      p_company_id: entity.type === "company" ? entity.id : null,
      p_opening_date: openingDate,
      p_entries: entries as never,
      p_lock_period: lockPeriod,
    });
    setPosting(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    const res = data as { success: boolean; error_message?: string };
    if (!res?.success) {
      toast.error(res?.error_message ?? "Posting was rejected");
      return;
    }
    toast.success("Opening balances posted to the ledger");
    qc.invalidateQueries({ queryKey: ["trial-balance"] });
    qc.invalidateQueries({ queryKey: ["ledger-entries"] });
    setBalances({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Opening Balances</DialogTitle>
          <DialogDescription>
            Enter the opening balances for {entity.name}. Balances are posted
            as an opening journal through the hardened ledger RPC and cannot
            be edited after posting except by reversing journal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-4 pb-4 border-b">
          <div className="space-y-1">
            <Label htmlFor="ob-date">Opening Date</Label>
            <Input
              id="ob-date"
              type="date"
              value={openingDate}
              onChange={(e) => setOpeningDate(e.target.value)}
              className="w-[180px]"
            />
          </div>
          <label className="flex items-center gap-2 pb-2">
            <Checkbox
              checked={lockPeriod}
              onCheckedChange={(c) => setLockPeriod(!!c)}
            />
            <span className="text-sm">Lock period at opening date</span>
          </label>
        </div>

        <div className="flex-1 overflow-y-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right w-[160px]">Debit</TableHead>
                <TableHead className="text-right w-[160px]">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.code}</TableCell>
                  <TableCell>{a.name}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      inputMode="decimal"
                      className="text-right font-mono"
                      value={balances[a.id]?.debit ?? ""}
                      onChange={(e) => update(a.id, "debit", e.target.value)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      inputMode="decimal"
                      className="text-right font-mono"
                      value={balances[a.id]?.credit ?? ""}
                      onChange={(e) => update(a.id, "credit", e.target.value)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between pt-2 text-sm">
          <div className="space-x-4 font-mono">
            <span>Debits: {formatCurrency(totals.d)}</span>
            <span>Credits: {formatCurrency(totals.c)}</span>
            <span
              className={
                totals.diff === 0 ? "text-emerald-600" : "text-destructive"
              }
            >
              Difference: {formatCurrency(totals.diff)}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePost}
            disabled={posting || totals.diff !== 0 || totals.d === 0}
          >
            {posting ? "Posting…" : "Post Opening Balances"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}