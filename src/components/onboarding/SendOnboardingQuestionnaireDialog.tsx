import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Send, Loader2, Copy, Check } from "lucide-react";

// ============================================
// Types
// ============================================

interface Template {
  id: string;
  name: string;
  description: string | null;
  content: Json;
}

interface SendOnboardingQuestionnaireDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onboardingId: string;
  organizationId: string;
  recipientEmail: string;
  recipientName: string;
  onSuccess: () => void;
}

interface PublicLinkResponse {
  instance_id: string;
  token: string;
  expires_at: string;
}

// ============================================
// Component
// ============================================

export function SendOnboardingQuestionnaireDialog({
  open,
  onOpenChange,
  onboardingId,
  organizationId,
  recipientEmail,
  recipientName,
  onSuccess,
}: SendOnboardingQuestionnaireDialogProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && organizationId) {
      loadTemplates();
      // Reset state when dialog opens
      setGeneratedLink(null);
      setCopied(false);
      setSelectedTemplateId("");
    }
  }, [open, organizationId]);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const { data, error } = await supabase
        .from("templates")
        .select("id, name, description, content")
        .eq("organization_id", organizationId)
        .eq("type", "questionnaire")
        .eq("status", "active");

      if (error) throw error;
      setTemplates((data as Template[]) || []);
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSend = async () => {
    if (!selectedTemplateId) {
      toast.error("Please select a questionnaire template");
      return;
    }

    setSending(true);
    try {
      const template = templates.find(t => t.id === selectedTemplateId);
      if (!template) throw new Error("Template not found");

      // Create the questionnaire instance.
      // status must satisfy questionnaire_instances_status_check (sent/in_progress/submitted/reviewed).
      // access_token is a legacy NOT NULL UNIQUE column; the secure token lives in
      // questionnaire_public_links and is created via the RPC below, so we just need
      // a unique placeholder here.
      const { data: instanceData, error: instanceError } = await supabase
        .from("questionnaire_instances")
        .insert([{
          organization_id: organizationId,
          template_id: selectedTemplateId,
          name: template.name,
          questions: template.content,
          sent_at: new Date().toISOString(),
          status: QUESTIONNAIRE_STATUS.SENT,
          access_token: uniqueLegacyToken("qn"),
        }])
        .select("id")
        .single();

      if (instanceError) throw instanceError;

      // Create a secure public link via RPC
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { data: linkData, error: linkError } = await supabase.rpc(
        "create_questionnaire_public_link",
        {
          p_instance_id: instanceData.id,
          p_expires_at: expiresAt.toISOString(),
        }
      );

      if (linkError) throw linkError;

      // Build the public URL
      const link = linkData as unknown as PublicLinkResponse;
      const publicUrl = `${window.location.origin}/questionnaire/${instanceData.id}?token=${link.token}`;
      setGeneratedLink(publicUrl);

      toast.success("Questionnaire created - copy the link to send to client");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create questionnaire";
      console.error("Error creating questionnaire:", error);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const handleCopyLink = async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDone = () => {
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Send Onboarding Questionnaire</DialogTitle>
          <DialogDescription>
            {generatedLink 
              ? "Copy the secure link below to send to your client"
              : "Send a questionnaire to collect client information and AML documents."
            }
          </DialogDescription>
        </DialogHeader>

        {generatedLink ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Questionnaire Link</Label>
              <div className="flex gap-2">
                <Input 
                  readOnly 
                  value={generatedLink} 
                  className="text-sm"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleCopyLink}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Links are single-use after submission and expire in 30 days. Send to {recipientName} ({recipientEmail}).
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleDone}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Recipient</Label>
                <p className="text-sm text-muted-foreground">
                  {recipientName} ({recipientEmail})
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template">Questionnaire Template</Label>
                {loadingTemplates ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading templates...
                  </div>
                ) : templates.length > 0 ? (
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No onboarding questionnaire templates found. Create one in Templates.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || !selectedTemplateId}
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Create Questionnaire
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
