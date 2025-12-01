import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Archive, ArchiveRestore, Link2, RefreshCw, Loader2 } from "lucide-react";
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
import { ConnectBankDialog } from "./ConnectBankDialog";
import { toast } from "sonner";
import { format } from "date-fns";

interface BankAccountsTabProps {
  entity: BookkeepingEntity;
}

export function BankAccountsTab({ entity }: BankAccountsTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<any>(null);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle connection callback status
  useEffect(() => {
    const connectionStatus = searchParams.get('connection');
    if (connectionStatus === 'success') {
      toast.success("Bank connected successfully! Your accounts have been imported.");
      searchParams.delete('connection');
      searchParams.delete('entity');
      setSearchParams(searchParams);
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank-connections"] });
    } else if (connectionStatus === 'error') {
      const message = searchParams.get('message') || 'Unknown error';
      toast.error(`Bank connection failed: ${message}`);
      searchParams.delete('connection');
      searchParams.delete('message');
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams, queryClient]);

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

  const { data: bankConnections } = useQuery({
    queryKey: ["bank-connections", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const query = supabase
        .from("bank_connections")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("status", "ACTIVE");

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

  const handleSync = (accountId: string) => {
    setSyncingAccountId(accountId);
    syncMutation.mutate(accountId);
  };

  const hasActiveConnection = bankConnections && bankConnections.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bank Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Manage bank accounts for {entity.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setConnectDialogOpen(true)}>
            <Link2 className="h-4 w-4 mr-2" />
            Connect Bank
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Manual Account
          </Button>
        </div>
      </div>

      {hasActiveConnection && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Link2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{bankConnections[0].bank_name || 'Connected Bank'}</p>
                <p className="text-sm text-muted-foreground">
                  Open Banking • Connected {format(new Date(bankConnections[0].created_at), 'dd MMM yyyy')}
                </p>
              </div>
            </div>
            <Badge variant="default">Active</Badge>
          </div>
        </div>
      )}

      {isLoading ? (
        <div>Loading bank accounts...</div>
      ) : !bankAccounts || bankAccounts.length === 0 ? (
        <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg">
          <div className="text-center space-y-4">
            <p className="text-lg font-medium">No bank accounts yet</p>
            <p className="text-sm text-muted-foreground">
              Connect your bank via Open Banking or add a manual account
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => setConnectDialogOpen(true)}>
                <Link2 className="h-4 w-4 mr-2" />
                Connect Bank
              </Button>
              <Button variant="secondary" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Manual
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Linked Account</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Last Synced</TableHead>
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
                        {bankAccount.account?.code}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {bankAccount.account?.name}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {bankAccount.provider === 'TRUELAYER' ? (
                      <Badge variant="secondary" className="bg-primary/10 text-primary">
                        Open Banking
                      </Badge>
                    ) : (
                      <Badge variant="outline">Manual</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {bankAccount.last_synced_at ? (
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(bankAccount.last_synced_at), 'dd MMM HH:mm')}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Never</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {bankAccount.is_active ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      {bankAccount.provider === 'TRUELAYER' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSync(bankAccount.id)}
                          disabled={syncingAccountId === bankAccount.id}
                        >
                          {syncingAccountId === bankAccount.id ? (
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

      <ConnectBankDialog
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        entity={entity}
      />
    </div>
  );
}
