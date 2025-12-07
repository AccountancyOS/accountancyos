import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CreditCard,
  Loader2,
  Pencil,
  RefreshCw,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { toast } from "sonner";
import { AddBankAccountDialog } from "./AddBankAccountDialog";
import { ImportBankTransactionsDialog } from "./ImportBankTransactionsDialog";
import { CategorizeBankTransactionDialog } from "./CategorizeBankTransactionDialog";
import { MatchingSuggestionsPanel } from "./MatchingSuggestionsPanel";
import { autoMatchHighConfidence } from "@/lib/matching-service";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface BankingTabProps {
  entity: BookkeepingEntity;
}

type ViewMode = "accounts" | "transactions";

interface BankAccount {
  id: string;
  name: string;
  currency: string;
  provider: string | null;
  is_active: boolean | null;
  last_synced_at: string | null;
  account_number: string | null;
  sort_code: string | null;
  account?: { code: string; name: string } | null;
}

export function BankingTab({ entity }: BankingTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("accounts");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<BankAccount | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [categorizeDialogOpen, setCategorizeDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [matchingPanelOpen, setMatchingPanelOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);

  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle connection callback status
  useEffect(() => {
    const connectionStatus = searchParams.get('connection');
    if (connectionStatus === 'success') {
      toast.success("Bank connected successfully! Accounts have been imported.");
      searchParams.delete('connection');
      searchParams.delete('entity');
      setSearchParams(searchParams);
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
    } else if (connectionStatus === 'error') {
      const message = searchParams.get('message') || 'Unknown error';
      toast.error(`Bank connection failed: ${message}`);
      searchParams.delete('connection');
      searchParams.delete('message');
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams, queryClient]);

  // Fetch bank accounts
  const { data: bankAccounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["bank-accounts", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const query = supabase
        .from("bank_accounts")
        .select(`
          *,
          account:bookkeeping_accounts(code, name)
        `)
        .eq("organization_id", organization.id)
        .order("name");

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as BankAccount[];
    },
    enabled: !!organization?.id,
  });

  // Fetch transactions for selected account
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ["bank-transactions", organization?.id, selectedAccountId, statusFilter],
    queryFn: async () => {
      if (!organization?.id || !selectedAccountId) return [];

      let query = supabase
        .from("bank_transactions")
        .select(`
          *,
          bank_account:bank_accounts(name),
          matched_entry:ledger_entries(description, debit, credit)
        `)
        .eq("bank_account_id", selectedAccountId)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id && !!selectedAccountId,
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async (bankAccountId: string) => {
      const { data, error } = await supabase.functions.invoke('truelayer-sync', {
        body: { bank_account_id: bankAccountId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast.success(`Synced: ${data.new_transactions} new, ${data.updated_transactions} updated`);
      setSyncingAccountId(null);
    },
    onError: (error) => {
      console.error("Sync failed:", error);
      toast.error("Failed to sync transactions");
      setSyncingAccountId(null);
    },
  });

  // Exclude mutation
  const excludeMutation = useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await supabase
        .from("bank_transactions")
        .update({ status: "EXCLUDED" })
        .eq("id", transactionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast.success("Transaction excluded");
    },
  });

  // Auto-match mutation
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
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
    },
    onError: (error) => {
      toast.error("Auto-match failed", { description: error.message });
    },
  });

  const handleSync = (accountId: string) => {
    setSyncingAccountId(accountId);
    syncMutation.mutate(accountId);
  };

  const handleViewTransactions = (accountId: string) => {
    setSelectedAccountId(accountId);
    setViewMode("transactions");
  };

  const handleBackToAccounts = () => {
    setViewMode("accounts");
    setSelectedAccountId(null);
    setStatusFilter("all");
  };

  const selectedAccount = bankAccounts?.find(a => a.id === selectedAccountId);

  // Check for accounts needing attention
  const accountsNeedingAttention = bankAccounts?.filter(
    a => a.provider === 'TRUELAYER' && a.last_synced_at && 
    new Date(a.last_synced_at) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  ) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "MATCHED":
        return <Badge className="bg-primary/10 text-primary border-primary/20">Matched</Badge>;
      case "CATEGORIZED":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Categorized</Badge>;
      case "EXCLUDED":
        return <Badge variant="secondary">Excluded</Badge>;
      case "UNREVIEWED":
      default:
        return <Badge variant="outline" className="border-amber-500/50 text-amber-600">Unreviewed</Badge>;
    }
  };

  const getConnectionStatusBadge = (account: BankAccount) => {
    if (account.provider !== 'TRUELAYER') {
      return <Badge variant="outline">Manual</Badge>;
    }
    
    if (!account.last_synced_at) {
      return <Badge variant="secondary">Pending Sync</Badge>;
    }

    const lastSync = new Date(account.last_synced_at);
    const daysSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceSync > 7) {
      return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Needs Attention</Badge>;
    }

    return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Connected</Badge>;
  };

  // Render accounts view
  if (viewMode === "accounts") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Banking</h2>
            <p className="text-sm text-muted-foreground">
              Manage bank accounts and transactions for {entity.name}
            </p>
          </div>
          <Button variant="outline" onClick={() => setAddDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Add Manual Account
          </Button>
        </div>

        {accountsNeedingAttention.length > 0 && (
          <Alert variant="default" className="border-amber-500/50 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-600">Accounts need attention</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              {accountsNeedingAttention.length} account(s) haven't synced in over a week. 
              The client may need to reconnect their bank via the portal.
            </AlertDescription>
          </Alert>
        )}

        {accountsLoading ? (
          <div className="flex items-center justify-center h-[300px]">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !bankAccounts || bankAccounts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <CreditCard className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium mb-2">No bank accounts connected</p>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Bank accounts are connected by clients through their portal using Open Banking. 
                You can also add a manual account to import transactions via CSV.
              </p>
              <Button variant="secondary" onClick={() => setAddDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Add Manual Account
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bankAccounts.map((account) => (
              <Card key={account.id} className="group hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{account.name}</h3>
                      {account.account_number && (
                        <p className="text-sm text-muted-foreground">
                          ••••{account.account_number.slice(-4)}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {getConnectionStatusBadge(account)}
                      <Badge variant="outline">{account.currency}</Badge>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground mb-4">
                    {account.account && (
                      <p>Linked: {account.account.code} - {account.account.name}</p>
                    )}
                    {account.last_synced_at ? (
                      <p>Last synced: {formatDistanceToNow(new Date(account.last_synced_at), { addSuffix: true })}</p>
                    ) : (
                      <p>Never synced</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleViewTransactions(account.id)}
                    >
                      View Transactions
                    </Button>
                    {account.provider === 'TRUELAYER' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSync(account.id)}
                        disabled={syncingAccountId === account.id}
                      >
                        {syncingAccountId === account.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditAccount(account);
                        setAddDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <AddBankAccountDialog
          open={addDialogOpen}
          onOpenChange={(open) => {
            setAddDialogOpen(open);
            if (!open) setEditAccount(null);
          }}
          entity={entity}
          editAccount={editAccount}
        />
      </div>
    );
  }

  // Render transactions view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBackToAccounts}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{selectedAccount?.name}</h2>
            <p className="text-sm text-muted-foreground">
              {selectedAccount?.currency} • {selectedAccount?.provider === 'TRUELAYER' ? 'Open Banking' : 'Manual'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => autoMatchMutation.mutate()}
            disabled={autoMatchMutation.isPending}
          >
            <Wand2 className="h-4 w-4 mr-2" />
            {autoMatchMutation.isPending ? "Matching..." : "Auto-match"}
          </Button>
          <Button onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="w-[200px]">
          <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Transactions</SelectItem>
              <SelectItem value="UNREVIEWED">Unreviewed</SelectItem>
              <SelectItem value="MATCHED">Matched</SelectItem>
              <SelectItem value="CATEGORIZED">Categorized</SelectItem>
              <SelectItem value="EXCLUDED">Excluded</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Transactions Table */}
      {transactionsLoading ? (
        <div className="flex items-center justify-center h-[300px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !transactions || transactions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CreditCard className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium mb-2">No transactions</p>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Import transactions from CSV or wait for Open Banking sync.
            </p>
            <Button onClick={() => setImportDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow
                  key={transaction.id}
                  className={`cursor-pointer transition-colors ${
                    transaction.status === "UNREVIEWED"
                      ? "bg-amber-500/5 hover:bg-amber-500/10"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => {
                    setSelectedTransaction(transaction);
                    setMatchingPanelOpen(true);
                  }}
                >
                  <TableCell>
                    {format(new Date(transaction.transaction_date), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{transaction.description}</div>
                      {transaction.matched_entry && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Matched: {transaction.matched_entry.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span
                      className={
                        transaction.amount > 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-destructive"
                      }
                    >
                      {formatCurrency(transaction.amount)}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                  <TableCell className="text-right">
                    {transaction.status === "UNREVIEWED" && (
                      <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedTransaction(transaction);
                            setCategorizeDialogOpen(true);
                          }}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Categorize
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => excludeMutation.mutate(transaction.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialogs */}
      <ImportBankTransactionsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        entity={entity}
        bankAccountId={selectedAccountId || ""}
      />

      <CategorizeBankTransactionDialog
        open={categorizeDialogOpen}
        onOpenChange={setCategorizeDialogOpen}
        entity={entity}
        transaction={selectedTransaction}
      />

      {/* Matching Suggestions Side Panel */}
      <Sheet open={matchingPanelOpen} onOpenChange={setMatchingPanelOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Transaction Details</SheetTitle>
          </SheetHeader>
          {selectedTransaction && (
            <MatchingSuggestionsPanel
              transactionId={selectedTransaction.id}
              onMatchApplied={() => {
                setMatchingPanelOpen(false);
                queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
