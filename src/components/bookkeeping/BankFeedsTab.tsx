import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Upload, Filter, Check, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { ImportBankTransactionsDialog } from "./ImportBankTransactionsDialog";
import { CategorizeBankTransactionDialog } from "./CategorizeBankTransactionDialog";
import { toast } from "sonner";

interface BankFeedsTabProps {
  entity: BookkeepingEntity;
}

export function BankFeedsTab({ entity }: BankFeedsTabProps) {
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [categorizeDialogOpen, setCategorizeDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const { data: bankAccounts } = useQuery({
    queryKey: ["bank-accounts", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const query = supabase
        .from("bank_accounts")
        .select("*")
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

  const { data: transactions, isLoading } = useQuery({
    queryKey: [
      "bank-transactions",
      organization?.id,
      selectedBankAccount,
    ],
    queryFn: async () => {
      if (!organization?.id || !selectedBankAccount) return [];

      const { data, error } = await supabase
        .from("bank_transactions")
        .select(`
          *,
          bank_account:bank_accounts(name),
          matched_entry:ledger_entries(description, debit, credit)
        `)
        .eq("bank_account_id", selectedBankAccount)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id && !!selectedBankAccount,
  });

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "MATCHED":
        return <Badge variant="default">Matched</Badge>;
      case "EXCLUDED":
        return <Badge variant="secondary">Excluded</Badge>;
      case "UNREVIEWED":
      default:
        return <Badge variant="outline">Unreviewed</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bank Feeds</h2>
          <p className="text-sm text-muted-foreground">
            Import and categorize bank transactions
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setImportDialogOpen(true)}
            disabled={!selectedBankAccount}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="w-[300px]">
          <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
            <SelectTrigger>
              <SelectValue placeholder="Select bank account" />
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
      </div>

      {!selectedBankAccount ? (
        <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">No bank account selected</p>
            <p className="text-sm text-muted-foreground">
              Select a bank account above to view transactions
            </p>
          </div>
        </div>
      ) : isLoading ? (
        <div>Loading transactions...</div>
      ) : !transactions || transactions.length === 0 ? (
        <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">No transactions yet</p>
            <p className="text-sm text-muted-foreground">
              Import transactions from CSV to get started
            </p>
          </div>
        </div>
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
                  className={
                    transaction.status === "UNREVIEWED"
                      ? "bg-yellow-50 dark:bg-yellow-950/10"
                      : ""
                  }
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
                          : "text-red-600 dark:text-red-400"
                      }
                    >
                      {formatCurrency(transaction.amount)}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                  <TableCell className="text-right">
                    {transaction.status === "UNREVIEWED" && (
                      <div className="flex gap-2 justify-end">
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

      <ImportBankTransactionsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        entity={entity}
        bankAccountId={selectedBankAccount}
      />

      <CategorizeBankTransactionDialog
        open={categorizeDialogOpen}
        onOpenChange={setCategorizeDialogOpen}
        entity={entity}
        transaction={selectedTransaction}
      />
    </div>
  );
}
