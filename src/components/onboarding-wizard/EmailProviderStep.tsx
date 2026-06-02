import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Mail, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  organizationId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export const EmailProviderStep = ({ organizationId, onComplete, onSkip }: Props) => {
  const { toast } = useToast();
  const [connecting, setConnecting] = useState<"gmail" | "outlook" | null>(null);
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("connected_mailboxes")
        .select("id, email_address, provider, status")
        .eq("organization_id", organizationId);
      setMailboxes(data ?? []);
      setLoading(false);
    })();
  }, [organizationId]);

  const connect = async (provider: "gmail" | "outlook") => {
    setConnecting(provider);
    try {
      const fn = provider === "gmail" ? "gmail-auth" : "outlook-auth";
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { redirect_url: window.location.origin },
      });
      if (error) throw error;
      if (data?.authorization_url) {
        window.location.href = data.authorization_url;
        return;
      }
    } catch (e: any) {
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
      setConnecting(null);
    }
  };

  const hasConnected = mailboxes.length > 0;

  return (
    <div className="space-y-6">
      {!hasConnected && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No Email Provider Connected</AlertTitle>
          <AlertDescription>
            AccountancyOS sends all client communication, chasers, and notifications from your own mailbox.
            Without a connected provider, no system emails will be sent. You can skip this step and connect later
            from Settings, but automation will remain paused until a mailbox is linked.
          </AlertDescription>
        </Alert>
      )}

      {hasConnected && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Mailbox Connected</AlertTitle>
          <AlertDescription>
            {mailboxes.map((m) => m.email_address).join(", ")} is ready to send and receive emails on your behalf.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Mail className="h-8 w-8 text-muted-foreground" />
            <div>
              <h4 className="font-semibold text-sm">Google Workspace / Gmail</h4>
              <p className="text-xs text-muted-foreground">
                Connect via Google OAuth to send and receive on behalf of your account.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => connect("gmail")}
              disabled={connecting !== null}
              type="button"
            >
              {connecting === "gmail" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Connect Gmail
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-3">
            <Mail className="h-8 w-8 text-muted-foreground" />
            <div>
              <h4 className="font-semibold text-sm">Microsoft 365 / Outlook</h4>
              <p className="text-xs text-muted-foreground">
                Connect via Microsoft OAuth for full two-way sync with your Outlook mailbox.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => connect("outlook")}
              disabled={connecting !== null}
              type="button"
            >
              {connecting === "outlook" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Connect Outlook
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onSkip} disabled={loading}>
          Skip for Now
        </Button>
        <Button type="button" onClick={onComplete} disabled={loading}>
          {hasConnected ? "Continue" : "Continue Without Email"}
        </Button>
      </div>
    </div>
  );
};