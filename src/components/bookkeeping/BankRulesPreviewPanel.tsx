import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wand2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { evaluateRulesForTransaction, type BankRule } from "@/lib/bank-rules-service";

interface BankRulesPreviewPanelProps {
  entity: BookkeepingEntity;
}

interface PreviewRow {
  txnId: string;
  date: string;
  description: string;
  amount: number;
  ruleId: string;
  ruleName: string;
  proposedAccountId: string | null;
}

/**
 * Read-only preview: shows which un-categorised bank transactions would
 * be matched by which active rule, with the proposed contra account.
 * Pure dry-run — does not post to the ledger.
 */
export function BankRulesPreviewPanel({ entity }: BankRulesPreviewPanelProps) {
  const { organization } = useOrganization();
  const [previewing, setPreviewing] = useState(false);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);

  // Resolve account names/codes for the proposed contra accounts
  const { data: accounts } = useQuery({
    queryKey: ["accounts-preview", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      const q = supabase
        .from("bookkeeping_accounts")
        .select("id, code, name")
        .eq("organization_id", organization!.id);
      if (entity.type === "client") q.eq("client_id", entity.id);
      else q.eq("company_id", entity.id);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));

  const runPreview = async () => {
    if (!organization?.id) return;
    setPreviewing(true);
    try {
      // Fetch un-categorised transactions for the entity
      const q = supabase
        .from("bank_transactions")
        .select("id, transaction_date, description, amount, bank_account_id")
        .eq("organization_id", organization.id)
        .in("status", ["PENDING", "UNREVIEWED"])
        .order("transaction_date", { ascending: false })
        .limit(200);
      if (entity.type === "client") q.eq("client_id", entity.id);
      else q.eq("company_id", entity.id);

      const { data: txns, error } = await q;
      if (error) throw error;

      const results: PreviewRow[] = [];
      for (const t of txns ?? []) {
        const matches = await evaluateRulesForTransaction(
          organization.id,
          entity.type,
          entity.id,
          {
            id: t.id,
            description: t.description ?? "",
            amount: Number(t.amount),
            bank_account_id: t.bank_account_id,
          }
        );
        if (matches.length === 0) continue;
        const top = matches[0] as { rule: BankRule };
        const setAccount = top.rule.actions.find((a) => a.type === "set_account");
        results.push({
          txnId: t.id,
          date: t.transaction_date,
          description: t.description ?? "",
          amount: Number(t.amount),
          ruleId: top.rule.id,
          ruleName: top.rule.ruleName,
          proposedAccountId: setAccount?.value ?? null,
        });
      }
      setRows(results);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wand2 className="h-4 w-4" />
          Rule Preview (Dry Run)
        </CardTitle>
        <Button size="sm" onClick={runPreview} disabled={previewing}>
          {previewing ? "Evaluating..." : "Preview Matches"}
        </Button>
      </CardHeader>
      <CardContent>
        {previewing && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
        {!previewing && rows === null && (
          <p className="text-sm text-muted-foreground">
            Click "Preview Matches" to see which un-categorised transactions
            would be matched by your active rules. Nothing is posted.
          </p>
        )}
        {!previewing && rows && rows.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No transactions matched by any active rule</p>
          </div>
        )}
        {!previewing && rows && rows.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {rows.length} transaction{rows.length === 1 ? "" : "s"} would be
              categorised. Review before applying rules.
            </p>
            <div className="border rounded-lg overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead>Proposed Account</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const acc = r.proposedAccountId
                      ? accountById.get(r.proposedAccountId)
                      : null;
                    return (
                      <TableRow key={r.txnId}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(r.date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate">
                          {r.description}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(r.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.ruleName}</Badge>
                        </TableCell>
                        <TableCell>
                          {acc ? (
                            <span className="text-sm">
                              <span className="font-mono text-xs text-muted-foreground mr-1">
                                {acc.code}
                              </span>
                              {acc.name}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              No account in rule
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}