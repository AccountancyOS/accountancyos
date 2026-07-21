import { useState } from "react";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Copy, Check } from "lucide-react";

// ============================================
// Types
// ============================================

interface Template {
  id: string;
  name: string;
  content: Json;
  service?: string | null;
}

interface SendQuestionnaireDialogProps {
  clientId?: string;
  companyId?: string;
  jobId?: string;
  onClose?: () => void;
}

interface PublicLinkResponse {
  instance_id: string;
  token: string;
  expires_at: string;
}

// ============================================
// Component
// ============================================

export function SendQuestionnaireDialog({ clientId, companyId, jobId, onClose }: SendQuestionnaireDialogProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    template_id: "",
    name: "",
    period_label: "",
  });

  const { data: templates } = useQuery<Template[]>({
    queryKey: ["questionnaire-templates", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("templates")
        .select("id, name, content, service")
        .eq("organization_id", organization.id)
        .eq("type", "questionnaire")
        .eq("status", "active")
        .order("name");

      if (error) throw error;
      return (data as Template[]) ?? [];
    },
    enabled: !!organization?.id && open,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !form.template_id) return;

    setLoading(true);
    try {
      const template = templates?.find(t => t.id === form.template_id);
      if (!template) throw new Error("Template not found");

      // Create the questionnaire instance
      // Note: access_token is deprecated but required by schema - RPC creates secure link
      const { data: instanceData, error: instanceError } = await supabase
        .from("questionnaire_instances")
        .insert([{
          organization_id: organization.id,
          client_id: clientId || null,
          company_id: companyId || null,
          job_id: jobId || null,
          template_id: form.template_id,
          name: form.name || template.name,
          period_label: form.period_label || null,
          questions: template.content,
          sent_at: new Date().toISOString(),
          status: "sent",
          access_token: crypto.randomUUID(), // Deprecated column; secure tokens live in questionnaire_public_links
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

      toast.success("Questionnaire created - copy the link below");

      queryClient.invalidateQueries({ queryKey: ["questionnaire-instances", clientId, companyId] });
      queryClient.invalidateQueries({ queryKey: ["job-questionnaires", jobId] });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create questionnaire";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setOpen(false);
    setGeneratedLink(null);
    setCopied(false);
    setForm({ template_id: "", name: "", period_label: "" });
    if (onClose) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else setOpen(true);
    }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Send Questionnaire
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send Questionnaire</DialogTitle>
          <DialogDescription>
            {generatedLink 
              ? "Copy the secure link below to send to your client"
              : "Send a records request questionnaire to the client"
            }
          </DialogDescription>
        </DialogHeader>

        {generatedLink ? (
          <div className="space-y-4">
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
                Links are single-use after submission and expire in 30 days.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template">Questionnaire Template *</Label>
              <Select
                value={form.template_id}
                onValueChange={(value) => setForm({ ...form, template_id: value })}
                required
              >
                <SelectTrigger id="template">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates?.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                      {template.service && ` (${template.service})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Custom Name (optional)</Label>
              <Input
                id="name"
                placeholder="e.g. 2024 Accounts Records"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="period">Period Label (optional)</Label>
              <Input
                id="period"
                placeholder="e.g. 2024/25 Tax Year"
                value={form.period_label}
                onChange={(e) => setForm({ ...form, period_label: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !form.template_id}>
                {loading ? "Creating..." : "Create Questionnaire"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
