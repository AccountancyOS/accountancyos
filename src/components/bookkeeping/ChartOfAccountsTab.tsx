import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Plus, Archive, ArchiveRestore } from "lucide-react";
import { AddAccountDialog } from "./AddAccountDialog";
import { toast } from "sonner";
import { getAccountTypeLabel } from "@/lib/bookkeeping-utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface ChartOfAccountsTabProps {
  entity: BookkeepingEntity;
}

export function ChartOfAccountsTab({ entity }: ChartOfAccountsTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<any>(null);
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["bookkeeping-accounts", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      const query = supabase
        .from("bookkeeping_accounts")
        .select("*")
        .eq("organization_id", organization.id)
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
    enabled: !!organization?.id,
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");
      
      const { error } = await supabase.rpc("seed_default_chart_of_accounts", {
        p_organization_id: organization.id,
        p_client_id: entity.type === "client" ? entity.id : null,
        p_company_id: entity.type === "company" ? entity.id : null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookkeeping-accounts"] });
      toast.success("Default chart of accounts created");
    },
    onError: (error) => {
      toast.error("Failed to create chart of accounts", {
        description: error.message,
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const account = accounts?.find((a) => a.id === accountId);
      if (!account) throw new Error("Account not found");

      const { error } = await supabase
        .from("bookkeeping_accounts")
        .update({ is_active: !account.is_active })
        .eq("id", accountId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookkeeping-accounts"] });
      toast.success("Account updated");
    },
  });

  const isEmpty = !accounts || accounts.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Chart of Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Manage accounts for {entity.name}
          </p>
        </div>
        <div className="flex gap-2">
          {isEmpty && (
            <Button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              Seed Default UK CoA
            </Button>
          )}
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div>Loading accounts...</div>
      ) : isEmpty ? (
        <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg">
          <div className="text-center space-y-4">
            <p className="text-lg font-medium">No accounts yet</p>
            <p className="text-sm text-muted-foreground">
              Seed the default UK chart of accounts or add accounts manually
            </p>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subtype</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts?.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-mono">{account.code}</TableCell>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>{getAccountTypeLabel(account.account_type)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {account.account_subtype || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {account.is_bank_account && (
                        <Badge variant="secondary" className="text-xs">
                          Bank
                        </Badge>
                      )}
                      {account.is_control_account && (
                        <Badge variant="secondary" className="text-xs">
                          Control
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {account.is_active ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Archived</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => archiveMutation.mutate(account.id)}
                    >
                      {account.is_active ? (
                        <Archive className="h-4 w-4" />
                      ) : (
                        <ArchiveRestore className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AddAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entity={entity}
        editAccount={editAccount}
      />
    </div>
  );
}
