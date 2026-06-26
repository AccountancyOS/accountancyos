import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Building2, Shield, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { type BookkeepingEntity } from "./EntitySelector";
import { isClientPortalDomain } from "@/portal/utils/portalPaths";

interface ConnectBankDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity;
  redirectPath?: string;
}

export function ConnectBankDialog({ open, onOpenChange, entity, redirectPath = "/bookkeeping" }: ConnectBankDialogProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const { organization } = useOrganization();

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke('truelayer-auth', {
        body: {
          entity_type: entity.type,
          entity_id: entity.id,
          organization_id: organization.id,
          redirect_path: redirectPath,
          surface: redirectPath.startsWith('/portal') || redirectPath.startsWith('/banking') || isClientPortalDomain() ? 'portal' : 'accountant',
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.auth_url) {
        // Redirect to TrueLayer
        window.location.href = data.auth_url;
      }
    },
    onError: (error) => {
      console.error("Failed to initiate bank connection:", error);
      toast.error("Failed to initiate bank connection");
      setIsConnecting(false);
    },
  });

  const handleConnect = () => {
    setIsConnecting(true);
    connectMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

          <div className="text-sm text-muted-foreground">
            <p>
              Connecting for: <strong>{entity.name}</strong>
            </p>
            <p className="mt-1">
              You'll be redirected to securely log in to your bank. The connection is valid for 90 days.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isConnecting}>
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
  );
}
