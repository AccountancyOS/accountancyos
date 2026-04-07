import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Building2, Shield, RefreshCw, Loader2, Plus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ClientBankingTabProps {
  clientId: string;
  companyId?: string;
}

export default function ClientBankingTab({ clientId, companyId }: ClientBankingTabProps) {
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle connection callback status
  useEffect(() => {
    const connectionStatus = searchParams.get('connection');
    if (connectionStatus === 'success') {
      toast.success("Bank connected successfully. Your accounts have been imported.");
      searchParams.delete('connection');
      searchParams.delete('entity');
      setSearchParams(searchParams);
      queryClient.invalidateQueries({ queryKey: ["client-bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["client-bank-connections"] });
    } else if (connectionStatus === 'error') {
      const message = searchParams.get('message') || 'Unknown error';
      toast.error(`Bank connection failed: ${message}`);
      searchParams.delete('connection');
      searchParams.delete('message');
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams, queryClient]);

  const { data: bankAccounts, isLoading } = useQuery({
    queryKey: ["client-bank-accounts", organization?.id, clientId, companyId],
    queryFn: async () => {
      if (!organization?.id) return [];

      let query = supabase
        .from("bank_accounts")
        .select(`
          *,
          account:bookkeeping_accounts(code, name)
        `)
        .eq("organization_id", organization.id)
        .order("name");

      if (companyId) {
        query = query.eq("company_id", companyId);
      } else {
        query = query.eq("client_id", clientId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const { data: bankConnections } = useQuery({
    queryKey: ["client-bank-connections", organization?.id, clientId, companyId],
    queryFn: async () => {
      if (!organization?.id) return [];

      let query = supabase
        .from("bank_connections")
        .select("id, bank_name, bank_logo_url, provider, status, organization_id, client_id, company_id, consent_expires_at, last_synced_at, last_error, scope, provider_connection_id, created_at, updated_at")
        .eq("organization_id", organization.id)
        .eq("status", "ACTIVE");

      if (companyId) {
        query = query.eq("company_id", companyId);
      } else {
        query = query.eq("client_id", clientId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke('truelayer-auth', {
        body: {
          entity_type: companyId ? 'company' : 'client',
          entity_id: companyId || clientId,
          organization_id: organization.id,
          redirect_path: `/clients/${clientId}`,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.auth_url) {
        window.location.href = data.auth_url;
      }
    },
    onError: (error) => {
      console.error("Failed to initiate bank connection:", error);
      toast.error("Failed to initiate bank connection");
      setIsConnecting(false);
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
      queryClient.invalidateQueries({ queryKey: ["client-bank-accounts"] });
      toast.success(`Synced: ${data.new_transactions} new, ${data.updated_transactions} updated`);
      setSyncingAccountId(null);
    },
    onError: (error) => {
      console.error("Sync failed:", error);
      toast.error("Failed to sync transactions");
      setSyncingAccountId(null);
    },
  });

  const handleConnect = () => {
    setIsConnecting(true);
    connectMutation.mutate();
  };

  const handleSync = (accountId: string) => {
    setSyncingAccountId(accountId);
    syncMutation.mutate(accountId);
  };

  const hasActiveConnection = bankConnections && bankConnections.length > 0;
  const connectedAccounts = bankAccounts?.filter(a => a.provider === 'TRUELAYER') || [];

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Bank Connection
          </CardTitle>
          <CardDescription>
            Connect your bank account to automatically import transactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasActiveConnection ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{bankConnections[0].bank_name || 'Connected Bank'}</p>
                  <p className="text-sm text-muted-foreground">
                    Connected via Open Banking • {format(new Date(bankConnections[0].created_at), 'dd MMM yyyy')}
                  </p>
                </div>
                <Badge variant="default">Active</Badge>
              </div>
              
              <Button variant="outline" onClick={() => setConnectDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Connect Another Bank
              </Button>
            </div>
          ) : (
            <div className="text-center py-8 space-y-4">
              <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <Link2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">No bank connected yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect your bank to automatically import transactions
                </p>
              </div>
              <Button onClick={() => setConnectDialogOpen(true)}>
                <Link2 className="h-4 w-4 mr-2" />
                Connect Your Bank
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connected Accounts */}
      {connectedAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Connected Accounts</CardTitle>
            <CardDescription>
              Your bank accounts linked via Open Banking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {connectedAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{account.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {account.account?.name || 'Linked account'}
                    </p>
                    {account.last_synced_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last synced: {format(new Date(account.last_synced_at), 'dd MMM HH:mm')}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSync(account.id)}
                    disabled={syncingAccountId === account.id}
                  >
                    {syncingAccountId === account.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Sync
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connect Bank Dialog */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Connect Your Bank Account</DialogTitle>
            <DialogDescription>
              Securely connect your bank account via Open Banking to automatically import transactions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Bank-grade Security</p>
                  <p className="text-sm text-muted-foreground">
                    Your credentials are never shared with us. We use Open Banking, regulated by the FCA.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <RefreshCw className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Automatic Sync</p>
                  <p className="text-sm text-muted-foreground">
                    Transactions are imported automatically, saving you hours of manual data entry.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">All Major UK Banks</p>
                  <p className="text-sm text-muted-foreground">
                    Connect accounts from Barclays, HSBC, Lloyds, NatWest, Santander, and more.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              You'll be redirected to securely log in to your bank. The connection is valid for 90 days.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialogOpen(false)} disabled={isConnecting}>
              Cancel
            </Button>
            <Button onClick={handleConnect} disabled={isConnecting || !organization}>
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect Bank"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
