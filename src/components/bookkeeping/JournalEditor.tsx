import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import type { BookkeepingEntity } from "./EntitySelector";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Plus, X, AlertTriangle, RefreshCw } from "lucide-react";
import { validateJournalBalance, formatCurrency } from "@/lib/bookkeeping-utils";
import { Badge } from "@/components/ui/badge";
import { SUPPORTED_CURRENCIES, getFXRate, calculateBaseCurrencyAmount } from "@/lib/fx-service";

interface JournalEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity;
  journal?: any;
}

interface JournalLine {
  account_id: string;
  debit: number | null;
  credit: number | null;
  description: string;
}

export function JournalEditor({ open, onOpenChange, entity, journal }: JournalEditorProps) {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [journalDate, setJournalDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [journalType, setJournalType] = useState("MANUAL");
  const [reverseDate, setReverseDate] = useState("");
  const [transactionCurrency, setTransactionCurrency] = useState("GBP");
  const [fxRateToBase, setFxRateToBase] = useState(1.0);
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  // True when the last FX fetch could not determine a rate: the shown rate is unsafe and the
  // journal must not be posted until the user supplies one manually.
  const [fxRateIsFallback, setFxRateIsFallback] = useState(false);
  const [lines, setLines] = useState<JournalLine[]>([
    { account_id: "", debit: null, credit: null, description: "" },
    { account_id: "", debit: null, credit: null, description: "" },
  ]);

  // Check for period lock
  const { data: periodLock } = useQuery({
    queryKey: ["period-lock", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return null;
      
      const query = supabase
        .from("period_locks")
        .select("lock_date, reason")
        .eq("organization_id", organization.id);
      
      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }
      
      const { data } = await query.order("lock_date", { ascending: false }).limit(1).single();
      return data;
    },
    enabled: !!organization?.id && open,
  });

  const isPeriodLocked = periodLock?.lock_date && new Date(journalDate) <= new Date(periodLock.lock_date);

  // Fetch accounts for dropdowns
  const { data: accounts } = useQuery({
    queryKey: ["bookkeeping-accounts", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const query = supabase
        .from("bookkeeping_accounts")
        .select("*")
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
      return data;
    },
    enabled: !!organization?.id && open,
  });

  // Load journal data if editing
  useEffect(() => {
    if (journal) {
      setJournalDate(journal.journal_date);
      setReference(journal.reference || "");
      setDescription(journal.description);
      setJournalType(journal.journal_type);
      setReverseDate(journal.reverse_date || "");
      setTransactionCurrency(journal.transaction_currency || "GBP");
      setFxRateToBase(Number(journal.fx_rate_to_base) || 1.0);
      setFxRateIsFallback(false);
    } else {
      // Reset form
      setJournalDate(new Date().toISOString().split("T")[0]);
      setReference("");
      setDescription("");
      setJournalType("MANUAL");
      setReverseDate("");
      setTransactionCurrency("GBP");
      setFxRateToBase(1.0);
      setFxRateIsFallback(false);
      setLines([
        { account_id: "", debit: null, credit: null, description: "" },
        { account_id: "", debit: null, credit: null, description: "" },
      ]);
    }
  }, [journal, open]);

  // Auto-fetch FX rate when currency or date changes
  const fetchFXRate = async () => {
    if (transactionCurrency === "GBP") {
      setFxRateToBase(1.0);
      setFxRateIsFallback(false);
      return;
    }

    setIsFetchingRate(true);
    try {
      const result = await getFXRate("GBP", transactionCurrency, journalDate);
      if (result.source === "fallback") {
        // Rate unknown — do NOT price at parity. Flag it and make the user enter it manually.
        setFxRateIsFallback(true);
        toast.error(`Couldn't fetch the ${transactionCurrency}→GBP rate for ${journalDate}`, {
          description: "Enter the exchange rate manually before posting this journal.",
        });
      } else {
        setFxRateToBase(result.rate);
        setFxRateIsFallback(false);
      }
    } catch (error) {
      console.error("Failed to fetch FX rate:", error);
      setFxRateIsFallback(true);
      toast.error("Couldn't fetch the exchange rate", {
        description: "Enter the exchange rate manually before posting this journal.",
      });
    } finally {
      setIsFetchingRate(false);
    }
  };

  useEffect(() => {
    if (open && transactionCurrency !== "GBP") {
      fetchFXRate();
    }
  }, [transactionCurrency, journalDate, open]);

  const validation = validateJournalBalance(lines);

  const saveMutation = useMutation({
    mutationFn: async (isPosted: boolean) => {
      if (!organization?.id || !user) throw new Error("Missing context");
      if (!validation.isValid) throw new Error("Debits must equal credits");
      if (isPeriodLocked) throw new Error(`Cannot post to locked period (locked until ${periodLock?.lock_date})`);
      // Never post a foreign-currency journal at an unresolved (fallback) rate — that silently
      // corrupts the ledger by treating the transaction currency as GBP.
      if (isPosted && transactionCurrency !== "GBP" && fxRateIsFallback) {
        throw new Error(`Enter the ${transactionCurrency}→GBP exchange rate before posting`);
      }

      // Calculate base currency totals
      const baseDebit = calculateBaseCurrencyAmount(validation.totalDebit, fxRateToBase);
      const baseCredit = calculateBaseCurrencyAmount(validation.totalCredit, fxRateToBase);

      const journalPayload: any = {
        organization_id: organization.id,
        journal_date: journalDate,
        reference: reference || null,
        description,
        journal_type: journalType,
        reverse_date: journalType === "REVERSING" && reverseDate ? reverseDate : null,
        total_debit: baseDebit,
        total_credit: baseCredit,
        transaction_currency: transactionCurrency,
        fx_rate_to_base: fxRateToBase,
        is_posted: isPosted,
        created_by: user.id,
      };

      if (entity.type === "client") {
        journalPayload.client_id = entity.id;
      } else {
        journalPayload.company_id = entity.id;
      }

      // Insert journal
      const { data: journalData, error: journalError } = await supabase
        .from("journals")
        .insert(journalPayload)
        .select()
        .single();

      if (journalError) throw journalError;

      // Insert lines
      const linePayloads = lines
        .filter((line) => line.account_id && (line.debit || line.credit))
        .map((line, idx) => ({
          journal_id: journalData.id,
          line_number: idx + 1,
          account_id: line.account_id,
          debit: line.debit ? calculateBaseCurrencyAmount(line.debit, fxRateToBase) : null,
          credit: line.credit ? calculateBaseCurrencyAmount(line.credit, fxRateToBase) : null,
          description: line.description || null,
        }));

      const { error: linesError } = await supabase
        .from("journal_lines")
        .insert(linePayloads);

      if (linesError) throw linesError;

      // If posted, create ledger entries with multi-currency support
      if (isPosted) {
        const ledgerPayloads = lines
          .filter((line) => line.account_id && (line.debit || line.credit))
          .map((line) => ({
            organization_id: organization.id,
            client_id: entity.type === "client" ? entity.id : null,
            company_id: entity.type === "company" ? entity.id : null,
            entry_date: journalDate,
            transaction_date: journalDate,
            account_id: line.account_id,
            debit: line.debit ? calculateBaseCurrencyAmount(line.debit, fxRateToBase) : null,
            credit: line.credit ? calculateBaseCurrencyAmount(line.credit, fxRateToBase) : null,
            description: line.description || description,
            reference: reference || null,
            journal_id: journalData.id,
            source_type: 'JOURNAL',
            source_id: journalData.id,
            transaction_currency: transactionCurrency,
            transaction_debit: line.debit,
            transaction_credit: line.credit,
            fx_rate_to_base: fxRateToBase,
            base_currency: "GBP",
          }));

        const { error: ledgerError } = await supabase
          .from("ledger_entries")
          .insert(ledgerPayloads);

        if (ledgerError) throw ledgerError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journals"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
      toast.success("Journal saved");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to save journal", { description: error.message });
    },
  });

  const addLine = () => {
    setLines([...lines, { account_id: "", debit: null, credit: null, description: "" }]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 2) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const updateLine = (index: number, field: keyof JournalLine, value: any) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setLines(newLines);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{journal ? "Edit Journal" : "New Journal"}</DialogTitle>
          <DialogDescription>
            Create a manual journal entry for {entity.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Period Lock Warning */}
          {isPeriodLocked && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                The selected date is in a locked period. Entries before {periodLock?.lock_date} cannot be posted.
                {periodLock?.reason && <> Reason: {periodLock.reason}</>}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={journalDate}
                onChange={(e) => setJournalDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Reference</Label>
              <Input
                placeholder="JNL-001"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={journalType} onValueChange={setJournalType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUAL">Manual</SelectItem>
                  <SelectItem value="REVERSING">Reversing</SelectItem>
                  <SelectItem value="YEAR_END">Year End</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={transactionCurrency} onValueChange={setTransactionCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((curr) => (
                    <SelectItem key={curr} value={curr}>{curr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* FX Rate (show only for non-GBP) */}
          {transactionCurrency !== "GBP" && (
            <div className={`flex flex-col gap-2 p-3 rounded-lg border ${fxRateIsFallback ? 'bg-destructive/10 border-destructive/40' : 'bg-muted/50'}`}>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="text-sm">FX Rate (1 GBP = {transactionCurrency})</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="number"
                      step="0.0001"
                      value={fxRateToBase}
                      onChange={(e) => {
                        setFxRateToBase(parseFloat(e.target.value) || 1);
                        // A manually entered rate clears the unsafe-fallback state.
                        setFxRateIsFallback(false);
                      }}
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={fetchFXRate}
                      disabled={isFetchingRate}
                    >
                      <RefreshCw className={`h-4 w-4 mr-1 ${isFetchingRate ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Base currency amounts will be calculated automatically
                </div>
              </div>
              {fxRateIsFallback && (
                <Alert variant="destructive" className="py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    The {transactionCurrency}→GBP rate couldn't be fetched, so it isn't priced. Enter the rate
                    manually (or Refresh) before posting — the journal cannot be posted until you do.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Journal description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {journalType === "REVERSING" && (
            <div className="space-y-2">
              <Label>Reverse Date</Label>
              <Input
                type="date"
                value={reverseDate}
                onChange={(e) => setReverseDate(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Journal Lines {transactionCurrency !== "GBP" && `(in ${transactionCurrency})`}</Label>
              <Button type="button" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-2" />
                Add Line
              </Button>
            </div>

            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-4">
                    <Select
                      value={line.account_id}
                      onValueChange={(value) => updateLine(idx, "account_id", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account..." />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts?.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.code} - {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Debit"
                      value={line.debit || ""}
                      onChange={(e) =>
                        updateLine(idx, "debit", e.target.value ? parseFloat(e.target.value) : null)
                      }
                      disabled={!!line.credit}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Credit"
                      value={line.credit || ""}
                      onChange={(e) =>
                        updateLine(idx, "credit", e.target.value ? parseFloat(e.target.value) : null)
                      }
                      disabled={!!line.debit}
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      placeholder="Line description"
                      value={line.description}
                      onChange={(e) => updateLine(idx, "description", e.target.value)}
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length <= 2}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex gap-4">
                <div className="text-sm">
                  <span className="text-muted-foreground">Total Dr ({transactionCurrency}):</span>{" "}
                  <span className="font-mono font-medium">
                    {validation.totalDebit.toFixed(2)}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Total Cr ({transactionCurrency}):</span>{" "}
                  <span className="font-mono font-medium">
                    {validation.totalCredit.toFixed(2)}
                  </span>
                </div>
                {transactionCurrency !== "GBP" && (
                  <div className="text-sm text-muted-foreground">
                    Base (GBP): {formatCurrency(calculateBaseCurrencyAmount(validation.totalDebit, fxRateToBase))}
                  </div>
                )}
              </div>
              {validation.isValid ? (
                <Badge variant="default">Balanced</Badge>
              ) : (
                <Badge variant="destructive">Out of Balance</Badge>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => saveMutation.mutate(false)}
            disabled={saveMutation.isPending || !validation.isValid}
          >
            Save as Draft
          </Button>
          <Button
            onClick={() => saveMutation.mutate(true)}
            disabled={
              saveMutation.isPending ||
              !validation.isValid ||
              isPeriodLocked ||
              (transactionCurrency !== "GBP" && fxRateIsFallback)
            }
          >
            Post Journal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
