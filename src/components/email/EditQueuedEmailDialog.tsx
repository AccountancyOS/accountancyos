import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Save, Eye, Code } from "lucide-react";

interface QueuedEmail {
  id: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  status: string;
  context: string | null;
  error_message: string | null;
}

interface EditQueuedEmailDialogProps {
  email: QueuedEmail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditQueuedEmailDialog({
  email,
  open,
  onOpenChange,
  onSaved,
}: EditQueuedEmailDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    to_email: "",
    to_name: "",
    subject: "",
    body_html: "",
    body_text: "",
    status: "queued",
  });
  const [viewMode, setViewMode] = useState<"preview" | "html">("preview");

  const isReadOnly = false; // All items in queue are editable
  const canEdit = email?.status === "draft" || email?.status === "queued" || email?.status === "failed";

  useEffect(() => {
    if (email) {
      setFormData({
        to_email: email.to_email || "",
        to_name: email.to_name || "",
        subject: email.subject || "",
        body_html: email.body_html || "",
        body_text: email.body_text || "",
        status: email.status || "queued",
      });
    }
  }, [email]);

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!email) throw new Error("No email selected");
      
      const { error } = await supabase
        .from("email_queue")
        .update({
          to_email: data.to_email,
          to_name: data.to_name || null,
          subject: data.subject,
          body_html: data.body_html || null,
          body_text: data.body_text || null,
          status: data.status,
          error_message: null, // Clear error on update
          updated_at: new Date().toISOString(),
        })
        .eq("id", email.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Email updated successfully" });
      onSaved();
    },
    onError: (error) => {
      toast({
        title: "Failed to update email",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = (newStatus?: string) => {
    updateMutation.mutate({
      ...formData,
      status: newStatus || formData.status,
    });
  };

  if (!email) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>
              {isReadOnly ? "View Email" : "Edit Email"}
            </DialogTitle>
            <Badge variant={email.status === "failed" ? "destructive" : "secondary"}>
              {email.status}
            </Badge>
          </div>
          {email.error_message && (
            <p className="text-sm text-destructive mt-2">{email.error_message}</p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Recipient */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="to_email">Recipient Email</Label>
              <Input
                id="to_email"
                type="email"
                value={formData.to_email}
                onChange={(e) => setFormData({ ...formData, to_email: e.target.value })}
                disabled={isReadOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to_name">Recipient Name</Label>
              <Input
                id="to_name"
                value={formData.to_name}
                onChange={(e) => setFormData({ ...formData, to_name: e.target.value })}
                disabled={isReadOnly}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              disabled={isReadOnly}
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Body</Label>
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
                <TabsList className="h-8">
                  <TabsTrigger value="preview" className="text-xs px-2 h-6">
                    <Eye className="h-3 w-3 mr-1" />
                    Preview
                  </TabsTrigger>
                  <TabsTrigger value="html" className="text-xs px-2 h-6">
                    <Code className="h-3 w-3 mr-1" />
                    HTML
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {viewMode === "preview" ? (
              <div 
                className="border rounded-md p-4 min-h-[200px] max-h-[300px] overflow-y-auto bg-background prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: formData.body_html || formData.body_text || "<p>No content</p>" }}
              />
            ) : (
              <Textarea
                value={formData.body_html || formData.body_text}
                onChange={(e) => setFormData({ ...formData, body_html: e.target.value })}
                disabled={isReadOnly}
                className="min-h-[200px] font-mono text-sm"
                placeholder="Email HTML content..."
              />
            )}
          </div>

          {/* Status (for editing) */}
          {canEdit && (
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="queued">Queued (Ready to Send)</SelectItem>
                  <SelectItem value="ignored">Ignored</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isReadOnly ? "Close" : "Cancel"}
          </Button>
          {canEdit && (
            <>
              <Button
                variant="secondary"
                onClick={() => handleSave("draft")}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save as Draft
              </Button>
              <Button
                onClick={() => handleSave("queued")}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Save & Queue
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}