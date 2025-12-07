import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import type { BookkeepingEntity } from "./EntitySelector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, subDays } from "date-fns";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { toast } from "sonner";
import { Check, Play, AlertCircle } from "lucide-react";
import { testRunRule, applyRuleToTransaction, type RuleCondition, type RuleAction } from "@/lib/bank-rules-service";

interface RuleTestRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: {
    id: string;
    rule_name: string;
    conditions: RuleCondition[];
    actions: RuleAction[];
  };
  entity: BookkeepingEntity;
}

interface MatchResult {
  transactionId: string;
  transactionDate: string;
  description: string;
  amount: number;
  matched: boolean;
  matchedConditions: string[];
  proposedActions: string[];
  selected: boolean;
}

export function RuleTestRunDialog({
  open,
  onOpenChange,
  rule,
  entity,
}: RuleTestRunDialogProps) {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [dateFrom, setDateFrom] = useState(
    subDays(new Date(), 90).toISOString().split("T")[0]
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);
  const [bankAccountId, setBankAccountId] = useState("all");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [hasRun, setHasRun] = useState(false);

  // Fetch bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ["bank-accounts-test", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const query = supabase
        .from("bank_accounts")
        .select("id, name")
        .eq("organization_id", organization.id)
        .eq("is_active", true);

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data } = await query.order("name");
      return data || [];
    },
    enabled: !!organization?.id,
  });

  // Fetch accounts and VAT codes for display
  const { data: accounts } = useQuery({
    queryKey: ["accounts-display", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data } = await supabase
        .from("bookkeeping_accounts")
        .select("id, code, name")
        .eq("organization_id", organization.id);
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const { data: vatCodes } = useQuery({
    queryKey: ["vat-codes-display", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data } = await supabase
        .from("vat_codes")
        .select("id, code, description")
        .eq("organization_id", organization.id);
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const runTestMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");

      // Fetch transactions in date range
      const query = supabase
        .from("bank_transactions")
        .select("id, transaction_date, description, amount, status")
        .eq("organization_id", organization.id)
        .eq("status", "PENDING")
        .gte("transaction_date", dateFrom)
        .lte("transaction_date", dateTo);

      if (bankAccountId !== "all") {
        query.eq("bank_account_id", bankAccountId);
      }

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data: transactions } = await query.order("transaction_date", { ascending: false });

      // Evaluate each transaction against rule conditions
      const matchResults: MatchResult[] = [];

      for (const tx of transactions || []) {
        const matchedConditions: string[] = [];
        let allMatch = true;

        for (const condition of rule.conditions) {
          const isMatch = evaluateCondition(condition, tx);
          if (isMatch) {
            matchedConditions.push(formatCondition(condition));
          } else {
            allMatch = false;
          }
        }

        // Format proposed actions
        const proposedActions = rule.actions.map((action) => formatAction(action));

        matchResults.push({
          transactionId: tx.id,
          transactionDate: tx.transaction_date,
          description: tx.description,
          amount: tx.amount,
          matched: allMatch,
          matchedConditions,
          proposedActions,
          selected: allMatch,
        });
      }

      return matchResults;
    },
    onSuccess: (data) => {
      setResults(data);
      setHasRun(true);
      const matchCount = data.filter((r) => r.matched).length;
      toast.success(`Test complete: ${matchCount} of ${data.length} transactions match`);
    },
    onError: (error) => {
      toast.error("Test failed", { description: error.message });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !user?.id) throw new Error("Missing context");

      const selectedResults = results.filter((r) => r.selected && r.matched);
      let applied = 0;
      let failed = 0;

      for (const result of selectedResults) {
        const applyResult = await applyRuleToTransaction(
          result.transactionId,
          rule.id,
          user.id
        );
        if (applyResult.success) {
          applied++;
        } else {
          failed++;
        }
      }

      return { applied, failed };
    },
    onSuccess: ({ applied, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["bank-rules"] });
      toast.success(`Applied rule to ${applied} transactions${failed > 0 ? `, ${failed} failed` : ""}`);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to apply rule", { description: error.message });
    },
  });

  const evaluateCondition = (condition: RuleCondition, tx: any): boolean => {
    switch (condition.field) {
      case "description":
        const desc = (tx.description || "").toLowerCase();
        const val = String(condition.value).toLowerCase();
        switch (condition.operator) {
          case "contains":
            return desc.includes(val);
          case "starts_with":
            return desc.startsWith(val);
          case "ends_with":
            return desc.endsWith(val);
          case "equals":
            return desc === val;
          default:
            return false;
        }
      case "amount":
        const amt = Math.abs(tx.amount);
        const target = Number(condition.value);
        switch (condition.operator) {
          case "equals":
            return Math.abs(amt - target) < 0.01;
          case "greater_than":
            return amt > target;
          case "less_than":
            return amt < target;
          case "between":
            return amt >= target && amt <= (condition.value2 || target);
          default:
            return false;
        }
      case "direction":
        const isIn = tx.amount > 0;
        return condition.value === "in" ? isIn : !isIn;
      default:
        return false;
    }
  };

  const formatCondition = (condition: RuleCondition): string => {
    return `${condition.field} ${condition.operator} "${condition.value}"`;
  };

  const formatAction = (action: RuleAction): string => {
    let value = action.value;
    if (action.type === "set_account") {
      const account = accounts?.find((a) => a.id === action.value);
      value = account ? `${account.code} - ${account.name}` : action.value;
    } else if (action.type === "set_vat_code") {
      const vat = vatCodes?.find((v) => v.id === action.value);
      value = vat ? `${vat.code} - ${vat.description}` : action.value;
    }
    return `${action.type.replace("set_", "Set ")}: ${value}`;
  };

  const toggleSelection = (transactionId: string) => {
    setResults((prev) =>
      prev.map((r) =>
        r.transactionId === transactionId ? { ...r, selected: !r.selected } : r
      )
    );
  };

  const selectAllMatched = () => {
    setResults((prev) =>
      prev.map((r) => ({ ...r, selected: r.matched }))
    );
  };

  const selectedCount = results.filter((r) => r.selected && r.matched).length;
  const matchedCount = results.filter((r) => r.matched).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Test Rule: {rule.rule_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 p-4 border rounded-lg bg-muted/30">
            <div className="space-y-1">
              <Label>Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <Label>Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <Label>Bank Account</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {bankAccounts?.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => runTestMutation.mutate()} disabled={runTestMutation.isPending}>
                <Play className="h-4 w-4 mr-2" />
                Run Test
              </Button>
            </div>
          </div>

          {/* Results */}
          {hasRun && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">
                  Results: {matchedCount} of {results.length} transactions match
                </h3>
                {matchedCount > 0 && (
                  <Button variant="outline" size="sm" onClick={selectAllMatched}>
                    Select All Matched
                  </Button>
                )}
              </div>

              {results.length === 0 ? (
                <div className="p-8 text-center border rounded-lg">
                  <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No transactions found in the selected date range</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="w-10 p-2"></th>
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Description</th>
                        <th className="text-right p-2">Amount</th>
                        <th className="text-center p-2">Match</th>
                        <th className="text-left p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((result) => (
                        <tr
                          key={result.transactionId}
                          className={`border-t ${result.matched ? "bg-green-50 dark:bg-green-950/20" : ""}`}
                        >
                          <td className="p-2 text-center">
                            {result.matched && (
                              <Checkbox
                                checked={result.selected}
                                onCheckedChange={() => toggleSelection(result.transactionId)}
                              />
                            )}
                          </td>
                          <td className="p-2">
                            {format(new Date(result.transactionDate), "dd/MM/yyyy")}
                          </td>
                          <td className="p-2 truncate max-w-[200px]">{result.description}</td>
                          <td
                            className={`p-2 text-right font-mono ${
                              result.amount > 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {formatCurrency(result.amount)}
                          </td>
                          <td className="p-2 text-center">
                            {result.matched ? (
                              <Badge variant="default" className="bg-green-600">
                                <Check className="h-3 w-3 mr-1" />
                                Match
                              </Badge>
                            ) : (
                              <Badge variant="secondary">No match</Badge>
                            )}
                          </td>
                          <td className="p-2">
                            {result.matched && (
                              <span className="text-xs text-muted-foreground">
                                {result.proposedActions.join(", ")}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {hasRun && selectedCount > 0 && (
            <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
              <Check className="h-4 w-4 mr-2" />
              Apply to {selectedCount} Transaction{selectedCount !== 1 ? "s" : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
