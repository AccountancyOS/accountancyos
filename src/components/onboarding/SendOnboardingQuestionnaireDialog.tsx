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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string | null;
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

  useEffect(() => {
    if (open && organizationId) {
      loadTemplates();
    }
  }, [open, organizationId]);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const { data, error } = await (supabase as any)
        .from("templates")
        .select("id, name, description")
        .eq("organization_id", organizationId)
        .eq("template_type", "questionnaire")
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
      const { data, error } = await supabase.rpc("send_onboarding_questionnaire", {
        p_onboarding_id: onboardingId,
        p_template_id: selectedTemplateId,
      });

      if (error) throw error;

      toast.success("Questionnaire sent successfully");
      onSuccess();
    } catch (error: any) {
      console.error("Error sending questionnaire:", error);
      toast.error(error.message || "Failed to send questionnaire");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Send Onboarding Questionnaire</DialogTitle>
          <DialogDescription>
            Send a questionnaire to collect client information and AML documents.
          </DialogDescription>
        </DialogHeader>

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
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Questionnaire
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
