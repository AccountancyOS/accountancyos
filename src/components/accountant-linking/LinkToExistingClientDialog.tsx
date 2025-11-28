import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Loader2, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { practiceRequestLink } from "@/lib/accountant-link-service";
import { useOrganization } from "@/lib/organization-context";

interface LinkToExistingClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LookupResult = 
  | { type: "not_found" }
  | { type: "found_unlinked"; clientId: string | null; companyId: string | null; clientUserId: string | null; name: string }
  | { type: "found_linked"; practiceName: string };

export default function LinkToExistingClientDialog({
  open,
  onOpenChange,
}: LinkToExistingClientDialogProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const handleLookup = async () => {
    if (!email.includes("@")) return;
    
    setIsLookingUp(true);
    setLookupResult(null);

    try {
      // Check if email exists as a client in the system
      const { data: client } = await supabase
        .from("clients")
        .select("id, first_name, last_name, email")
        .eq("email", email)
        .maybeSingle();

      const { data: company } = await supabase
        .from("companies")
        .select("id, company_name, email")
        .eq("email", email)
        .maybeSingle();

      if (!client && !company) {
        setLookupResult({ type: "not_found" });
        return;
      }

      // Check if already linked to a practice
      const { data: existingLink } = await supabase
        .from("accountant_client_links")
        .select(`
          id,
          status,
          practice:organizations!practice_id(name)
        `)
        .eq("status", "active")
        .or(client ? `client_id.eq.${client.id}` : `company_id.eq.${company?.id}`)
        .maybeSingle();

      if (existingLink) {
        setLookupResult({
          type: "found_linked",
          practiceName: (existingLink.practice as any)?.name || "another practice",
        });
      } else {
        setLookupResult({
          type: "found_unlinked",
          clientId: client?.id || null,
          companyId: company?.id || null,
          clientUserId: null, // Would need user lookup
          name: client 
            ? `${client.first_name} ${client.last_name}` 
            : company?.company_name || "",
        });
      }
    } catch (error) {
      toast.error("Failed to lookup client");
    } finally {
      setIsLookingUp(false);
    }
  };

  // Request link mutation
  const requestLinkMutation = useMutation({
    mutationFn: () => {
      if (lookupResult?.type !== "found_unlinked") {
        throw new Error("Invalid state");
      }
      return practiceRequestLink(
        organization?.id || "",
        lookupResult.clientId,
        lookupResult.companyId,
        lookupResult.clientUserId
      );
    },
    onSuccess: () => {
      toast.success("Link request sent to client");
      queryClient.invalidateQueries({ queryKey: ["outgoing-link-requests"] });
      onOpenChange(false);
      setEmail("");
      setLookupResult(null);
    },
    onError: () => {
      toast.error("Failed to send link request");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link to Existing Client</DialogTitle>
          <DialogDescription>
            Connect with a client who is already using AccountancyOS
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Client's email address</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="client@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setLookupResult(null);
                }}
              />
              <Button
                onClick={handleLookup}
                disabled={!email.includes("@") || isLookingUp}
              >
                {isLookingUp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Lookup"
                )}
              </Button>
            </div>
          </div>

          {/* Results */}
          {lookupResult?.type === "not_found" && (
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>
                No client found with this email. You can invite them to join
                AccountancyOS or create them as a new client.
              </AlertDescription>
            </Alert>
          )}

          {lookupResult?.type === "found_linked" && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This client is already linked to <strong>{lookupResult.practiceName}</strong>.
                They'll need to approve a switch before you can act as their accountant.
              </AlertDescription>
            </Alert>
          )}

          {lookupResult?.type === "found_unlinked" && (
            <div className="space-y-4">
              <Alert className="bg-green-50 border-green-200">
                <Check className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Found: <strong>{lookupResult.name}</strong>
                  <br />
                  This client is on AccountancyOS but not linked to any practice.
                </AlertDescription>
              </Alert>

              <Button
                className="w-full"
                onClick={() => requestLinkMutation.mutate()}
                disabled={requestLinkMutation.isPending}
              >
                {requestLinkMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Send Link Request
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
