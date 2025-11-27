import { useState } from "react";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
import { Plus } from "lucide-react";

interface SendQuestionnaireDialogProps {
  clientId: string;
  jobId?: string;
  onClose?: () => void;
}

export function SendQuestionnaireDialog({ clientId, jobId, onClose }: SendQuestionnaireDialogProps) {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    template_id: "",
    name: "",
    period_label: "",
  });

  const { data: templates } = useQuery({
    queryKey: ["questionnaire-templates", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("type", "questionnaire")
        .eq("status", "active")
        .order("name");

      if (error) throw error;
      return data;
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

      // Generate secure access token
      const accessToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

      const { error } = await supabase
        .from("questionnaire_instances")
        .insert({
          organization_id: organization.id,
          client_id: clientId,
          job_id: jobId || null,
          template_id: form.template_id,
          name: form.name || template.name,
          period_label: form.period_label || null,
          questions: template.content,
          access_token: accessToken,
          token_expires_at: expiresAt.toISOString(),
          sent_at: new Date().toISOString(),
          status: "sent",
        });

      if (error) throw error;

      toast({
        title: "Questionnaire sent",
        description: "The questionnaire has been sent to the client",
      });

      queryClient.invalidateQueries({ queryKey: ["questionnaire-instances", clientId] });
      queryClient.invalidateQueries({ queryKey: ["job-questionnaires", jobId] });
      setOpen(false);
      setForm({ template_id: "", name: "", period_label: "" });
      if (onClose) onClose();
    } catch (error: any) {
      toast({
        title: "Error sending questionnaire",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            Send a records request questionnaire to the client
          </DialogDescription>
        </DialogHeader>
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !form.template_id}>
              {loading ? "Sending..." : "Send Questionnaire"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
