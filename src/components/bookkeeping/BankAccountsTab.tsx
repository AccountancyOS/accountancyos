import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Archive, ArchiveRestore } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AddBankAccountDialog } from "./AddBankAccountDialog";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/bookkeeping-utils";

interface BankAccountsTabProps {
  entity: BookkeepingEntity;
}

export function BankAccountsTab({ entity }: BankAccountsTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<any>(null);
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const { data: bankAccounts, isLoading } = useQuery({
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
      return data;
    },
    enabled: !!organization?.id,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const account = bankAccounts?.find((a) => a.id === accountId);
      if (!account) throw new Error("Account not found");

      const { error } = await supabase
        .from("bank_accounts")
        .update({ is_active: !account.is_active })
        .eq("id", accountId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      toast.success("Bank account updated");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bank Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Manage bank accounts for {entity.name}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Bank Account
        </Button>
      </div>

      {isLoading ? (
        <div>Loading bank accounts...</div>
      ) : !bankAccounts || bankAccounts.length === 0 ? (
        <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg">
          <div className="text-center space-y-4">
            <p className="text-lg font-medium">No bank accounts yet</p>
            <p className="text-sm text-muted-foreground">
              Add a bank account to start importing transactions
            </p>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Linked Account</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bankAccounts?.map((bankAccount) => (
                <TableRow key={bankAccount.id}>
                  <TableCell className="font-medium">
                    {bankAccount.name}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-mono text-sm">
                        {bankAccount.account.code}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {bankAccount.account.name}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{bankAccount.currency}</TableCell>
                  <TableCell>
                    {bankAccount.is_active ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditAccount(bankAccount);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActiveMutation.mutate(bankAccount.id)}
                      >
                        {bankAccount.is_active ? (
                          <Archive className="h-4 w-4" />
                        ) : (
                          <ArchiveRestore className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AddBankAccountDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditAccount(null);
        }}
        entity={entity}
        editAccount={editAccount}
      />
    </div>
  );
}
