import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { toast } from "sonner";
import { Wand2, X, Scale } from "lucide-react";
import { MatchingSuggestionsPanel } from "./MatchingSuggestionsPanel";
import { autoMatchHighConfidence } from "@/lib/matching-service";
import { BookkeepingEmptyState } from "./BookkeepingEmptyState";

interface BankReconciliationTabProps {
  entity: BookkeepingEntity | null;
}

export function BankReconciliationTab({ entity }: BankReconciliationTabProps) {
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [closingBalance, setClosingBalance] = useState("");
  const [selectedBankTransactions, setSelectedBankTransactions] = useState<Set<string>>(new Set());
  const [selectedLedgerEntries, setSelectedLedgerEntries] = useState<Set<string>>(new Set());
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [matchingPanelOpen, setMatchingPanelOpen] = useState(false);
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  if (!entity) {
    return (
      <BookkeepingEmptyState
        icon={Scale}
        title="No entity selected"
        description="Select a client or company above to perform bank reconciliation"
      />
    );
  }

  const { data: bankAccounts } = useQuery({
    queryKey: ["bank-accounts", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const query = supabase
        .from("bank_accounts")
        .select("*, account:bookkeeping_accounts(id)")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("name");

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const selectedAccount = bankAccounts?.find((a) => a.id === selectedBankAccount);

  const { data: bankTransactions } = useQuery({
    queryKey: [
      "bank-transactions-rec",
      selectedBankAccount,
      startDate,
      endDate,
    ],
    queryFn: async () => {
      if (!selectedBankAccount || !startDate || !endDate) return [];

      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*")
        .eq("bank_account_id", selectedBankAccount)
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate)
        .order("transaction_date");

      if (error) throw error;
      return data;
    },
    enabled: !!selectedBankAccount && !!startDate && !!endDate,
  });

  const { data: ledgerEntries } = useQuery({
    queryKey: [
      "ledger-entries-rec",
      selectedAccount?.account?.id,
      startDate,
      endDate,
    ],
    queryFn: async () => {
      if (!selectedAccount?.account?.id || !startDate || !endDate) return [];

      const { data, error } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("account_id", selectedAccount.account.id)
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate)
        .order("transaction_date");

      if (error) throw error;
      return data;
    },
    enabled: !!selectedAccount?.account?.id && !!startDate && !!endDate,
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !selectedBankAccount) throw new Error("Missing data");

      // Calculate difference
      const bankTotal = Array.from(selectedBankTransactions).reduce((sum, id) => {
        const tx = bankTransactions?.find((t) => t.id === id);
        return sum + (tx?.amount || 0);
      }, 0);

      const difference = parseFloat(closingBalance) - parseFloat(openingBalance) - bankTotal;

      if (Math.abs(difference) > 0.01) {
        throw new Error(`Reconciliation difference: ${formatCurrency(difference)}`);
      }

      // Create reconciliation record
      const { data: rec, error: recError } = await supabase
        .from("reconciliations")
        .insert({
          organization_id: organization.id,
          client_id: entity.type === "client" ? entity.id : null,
          company_id: entity.type === "company" ? entity.id : null,
          bank_account_id: selectedBankAccount,
          statement_start_date: startDate,
          statement_end_date: endDate,
          statement_opening_balance: parseFloat(openingBalance),
          statement_closing_balance: parseFloat(closingBalance),
          status: "COMPLETED",
          completed_by: user?.id,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (recError) throw recError;

      // Create reconciliation lines for matches
      const lines = [
        ...Array.from(selectedBankTransactions).map((id) => {
          const tx = bankTransactions?.find((t) => t.id === id);
          return {
            reconciliation_id: rec.id,
            bank_transaction_id: id,
            ledger_entry_id: null,
            match_type: "ONE_TO_ONE",
            amount: tx?.amount || 0,
          };
        }),
        ...Array.from(selectedLedgerEntries).map((id) => {
          const entry = ledgerEntries?.find((e) => e.id === id);
          const amount = (entry?.debit || 0) - (entry?.credit || 0);
          return {
            reconciliation_id: rec.id,
            bank_transaction_id: null,
            ledger_entry_id: id,
            match_type: "ONE_TO_ONE",
            amount,
          };
        }),
      ];

      const { error: linesError } = await supabase
        .from("reconciliation_lines")
        .insert(lines);

      if (linesError) throw linesError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-rec"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-entries-rec"] });
      toast.success("Reconciliation completed");
      // Reset form
      setSelectedBankTransactions(new Set());
      setSelectedLedgerEntries(new Set());
      setStartDate("");
      setEndDate("");
      setOpeningBalance("");
      setClosingBalance("");
    },
    onError: (error) => {
      toast.error("Failed to complete reconciliation", {
        description: error.message,
      });
    },
  });

  // Auto-match high confidence mutation
  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !user?.id) throw new Error("Missing context");
      return autoMatchHighConfidence(
        organization.id,
        entity.type,
        entity.id,
        user.id
      );
    },
    onSuccess: (result) => {
      if (result) {
        toast.success(`Auto-matched ${result.matched} transactions`, {
          description: `${result.skipped} transactions skipped (no 100% match)`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["bank-transactions-rec"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
    },
    onError: (error) => {
      toast.error("Auto-match failed", { description: error.message });
    },
  });

  const bankTotal = Array.from(selectedBankTransactions).reduce((sum, id) => {
    const tx = bankTransactions?.find((t) => t.id === id);
    return sum + (tx?.amount || 0);
  }, 0);

  const ledgerTotal = Array.from(selectedLedgerEntries).reduce((sum, id) => {
    const entry = ledgerEntries?.find((e) => e.id === id);
    const amount = (entry?.debit || 0) - (entry?.credit || 0);
    return sum + amount;
  }, 0);

  const calculatedClosing = parseFloat(openingBalance || "0") + bankTotal;
  const difference = parseFloat(closingBalance || "0") - calculatedClosing;

  const handleTransactionClick = (txId: string) => {
    setSelectedTransactionId(txId);
    setMatchingPanelOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bank Reconciliation</h2>
          <p className="text-sm text-muted-foreground">
            Match bank statement to ledger entries
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => autoMatchMutation.mutate()}
          disabled={autoMatchMutation.isPending}
        >
          <Wand2 className="mr-2 h-4 w-4" />
          {autoMatchMutation.isPending ? "Matching..." : "Auto-match 100% Confidence"}
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Bank Account</Label>
            <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts?.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>End Date</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Opening Balance</Label>
            <Input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label>Statement Closing Balance</Label>
            <Input
              type="number"
              step="0.01"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label>Calculated Difference</Label>
            <div
              className={`text-lg font-bold ${
                Math.abs(difference) < 0.01
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {formatCurrency(difference)}
            </div>
          </div>
        </div>
      </Card>

      {!selectedBankAccount || !startDate || !endDate ? (
        <BookkeepingEmptyState
          icon={Scale}
          title="Set reconciliation parameters"
          description="Select a bank account and date range to begin reconciling transactions"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bank Transactions Column */}
            <Card className="p-4">
              <h3 className="font-bold mb-4">
                Bank Statement ({bankTransactions?.length || 0} transactions)
              </h3>
              <div className="space-y-2 max-h-[400px] overflow-auto">
                {bankTransactions?.map((tx) => (
                  <div
                    key={tx.id}
                    onClick={() => handleTransactionClick(tx.id)}
                    className={`flex items-start gap-2 p-2 border rounded cursor-pointer transition-colors ${
                      selectedTransactionId === tx.id
                        ? "bg-primary/10 ring-2 ring-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <Checkbox
                      checked={selectedBankTransactions.has(tx.id)}
                      onCheckedChange={(checked) => {
                        const newSet = new Set(selectedBankTransactions);
                        if (checked) {
                          newSet.add(tx.id);
                        } else {
                          newSet.delete(tx.id);
                        }
                        setSelectedBankTransactions(newSet);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 text-sm">
                      <div className="font-medium">{format(new Date(tx.transaction_date), "dd/MM/yyyy")}</div>
                      <div className="text-muted-foreground">{tx.description}</div>
                      <div
                        className={`font-mono ${
                          tx.amount > 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatCurrency(tx.amount)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between font-bold">
                  <span>Selected Total:</span>
                  <span>{formatCurrency(bankTotal)}</span>
                </div>
              </div>
            </Card>

            {/* Ledger Entries Column */}
            <Card className="p-4">
              <h3 className="font-bold mb-4">
                Ledger Entries ({ledgerEntries?.length || 0} entries)
              </h3>
              <div className="space-y-2 max-h-[400px] overflow-auto">
                {ledgerEntries?.map((entry) => {
                  const amount = (entry.debit || 0) - (entry.credit || 0);
                  return (
                    <div
                      key={entry.id}
                      className="flex items-start gap-2 p-2 border rounded hover:bg-muted"
                    >
                      <Checkbox
                        checked={selectedLedgerEntries.has(entry.id)}
                        onCheckedChange={(checked) => {
                          const newSet = new Set(selectedLedgerEntries);
                          if (checked) {
                            newSet.add(entry.id);
                          } else {
                            newSet.delete(entry.id);
                          }
                          setSelectedLedgerEntries(newSet);
                        }}
                      />
                      <div className="flex-1 text-sm">
                        <div className="font-medium">{format(new Date(entry.transaction_date), "dd/MM/yyyy")}</div>
                        <div className="text-muted-foreground">{entry.description}</div>
                        <div className="flex gap-4 font-mono">
                          {entry.debit && <span>Dr: {formatCurrency(entry.debit)}</span>}
                          {entry.credit && <span>Cr: {formatCurrency(entry.credit)}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between font-bold">
                  <span>Selected Total:</span>
                  <span>{formatCurrency(ledgerTotal)}</span>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setSelectedBankTransactions(new Set());
            setSelectedLedgerEntries(new Set());
          }}
        >
          Clear Selection
        </Button>
        <Button
          onClick={() => completeMutation.mutate()}
          disabled={
            completeMutation.isPending ||
            Math.abs(difference) > 0.01 ||
            !selectedBankAccount ||
            !startDate ||
            !endDate ||
            !openingBalance ||
            !closingBalance
          }
        >
          {completeMutation.isPending ? "Completing..." : "Complete Reconciliation"}
        </Button>
      </div>

      {/* Matching Suggestions Side Panel */}
      <Sheet open={matchingPanelOpen} onOpenChange={setMatchingPanelOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              Matching Suggestions
            </SheetTitle>
          </SheetHeader>
          {selectedTransactionId && (
            <div className="mt-4">
              <MatchingSuggestionsPanel
                transactionId={selectedTransactionId}
                onMatchApplied={() => {
                  queryClient.invalidateQueries({ queryKey: ["bank-transactions-rec"] });
                  queryClient.invalidateQueries({ queryKey: ["invoices"] });
                  queryClient.invalidateQueries({ queryKey: ["bills"] });
                  setMatchingPanelOpen(false);
                  setSelectedTransactionId(null);
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
