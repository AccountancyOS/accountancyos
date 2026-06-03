import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Send, Eye, FileSignature, Clock, CheckCircle, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface EngagementLetterSectionProps {
  applicationId: string;
  organizationId: string;
  recipientEmail: string;
  recipientName: string;
  onLetterStatusChange?: () => void;
}

interface EngagementLetter {
  id: string;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signature_token: string | null;
  token_expires_at: string | null;
}

const EngagementLetterSection = ({
  applicationId,
  organizationId,
  recipientEmail,
  recipientName,
  onLetterStatusChange,
}: EngagementLetterSectionProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [letter, setLetter] = useState<EngagementLetter | null>(null);
  const [hasMailbox, setHasMailbox] = useState<boolean | null>(null);

  useEffect(() => {
    loadEngagementLetter();
    checkMailboxStatus();
  }, [applicationId]);

  const loadEngagementLetter = async () => {
    try {
      const { data, error } = await supabase
        .from("engagement_letters")
        .select("id, sent_at, viewed_at, signed_at, signature_token, token_expires_at")
        .eq("onboarding_application_id", applicationId)
        .maybeSingle();

      if (error) throw error;
      setLetter(data);
    } catch (error: any) {
      console.error("Error loading engagement letter:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkMailboxStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("connected_mailboxes_safe")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1);

      if (error) throw error;
      setHasMailbox(data && data.length > 0);
    } catch (error: any) {
      console.error("Error checking mailbox:", error);
      setHasMailbox(false);
    }
  };

  const sendEngagementLetter = async () => {
    setSending(true);
    try {
      // Generate a unique signature token
      const signatureToken = crypto.randomUUID();
      const tokenExpiresAt = new Date();
      tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 14); // 14 days validity

      let letterId = letter?.id;

      // Create or update engagement letter record
      if (letter) {
        const { error } = await supabase
          .from("engagement_letters")
          .update({
            signature_token: signatureToken,
            token_expires_at: tokenExpiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", letter.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("engagement_letters")
          .insert({
            organization_id: organizationId,
            onboarding_application_id: applicationId,
            signature_token: signatureToken,
            token_expires_at: tokenExpiresAt.toISOString(),
          })
          .select("id")
          .single();

        if (error) throw error;
        letterId = data.id;
      }

      // Send via connected mailbox using edge function
      const { data, error: sendError } = await supabase.functions.invoke("send-engagement-letter", {
        body: { engagement_letter_id: letterId },
      });

      if (sendError) throw sendError;

      if (!data.success) {
        throw new Error(data.error || "Failed to send engagement letter");
      }

      toast({
        title: "Engagement letter sent",
        description: `Sent from ${data.sent_via} to ${recipientEmail}`,
      });

      loadEngagementLetter();
      onLetterStatusChange?.();
    } catch (error: any) {
      toast({
        title: "Error sending engagement letter",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const getStatus = () => {
    if (!letter) return "not_created";
    if (letter.signed_at) return "signed";
    if (letter.viewed_at) return "viewed";
    if (letter.sent_at) return "sent";
    return "draft";
  };

  const status = getStatus();

  const statusConfig = {
    not_created: { label: "Not Created", variant: "secondary" as const, icon: Clock },
    draft: { label: "Draft", variant: "secondary" as const, icon: Clock },
    sent: { label: "Sent", variant: "default" as const, icon: Send },
    viewed: { label: "Viewed", variant: "default" as const, icon: Eye },
    signed: { label: "Signed", variant: "default" as const, icon: CheckCircle },
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Engagement Letter
          </CardTitle>
          <Badge variant={config.variant}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* No mailbox warning */}
        {hasMailbox === false && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium">No mailbox connected</p>
              <p className="text-xs mt-1">Connect Gmail or Outlook in Settings to send engagement letters from your email.</p>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-2 text-sm">
          {letter?.sent_at && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Send className="h-4 w-4" />
              <span>Sent {format(new Date(letter.sent_at), "dd MMM yyyy 'at' HH:mm")}</span>
            </div>
          )}
          {letter?.viewed_at && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Eye className="h-4 w-4" />
              <span>Viewed {format(new Date(letter.viewed_at), "dd MMM yyyy 'at' HH:mm")}</span>
            </div>
          )}
          {letter?.signed_at && (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span>Signed {format(new Date(letter.signed_at), "dd MMM yyyy 'at' HH:mm")}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="pt-2 flex flex-wrap gap-2">
          {letter?.signature_token && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(`/engagement/${letter.signature_token}`, "_blank", "noopener")
              }
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Letter
            </Button>
          )}
          {status !== "signed" && (
            <Button
              onClick={sendEngagementLetter}
              disabled={sending || hasMailbox === false}
              variant={letter?.sent_at ? "outline" : "default"}
              size="sm"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {letter?.sent_at ? "Resend Letter" : "Send Engagement Letter"}
            </Button>
          )}
        </div>
        {status !== "signed" && !letter?.sent_at && hasMailbox !== false && (
          <p className="text-xs text-muted-foreground">
            Will be sent to: {recipientEmail}
          </p>
        )}

        {/* Token expiry warning */}
        {letter?.token_expires_at && status === "sent" && (
          <p className="text-xs text-muted-foreground">
            Signature link expires {format(new Date(letter.token_expires_at), "dd MMM yyyy")}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default EngagementLetterSection;
