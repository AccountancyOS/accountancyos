import { useState } from "react";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageCircle } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface NewMessageDialogProps {
  clientId: string;
}

export function NewMessageDialog({ clientId }: NewMessageDialogProps) {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    content: "",
    message_type: "note" as "note" | "email" | "message",
    visibility: "client_visible" as "client_visible" | "internal_only",
  });

  const createMessageMutation = useMutation({
    mutationFn: async () => {
      if (!organization || !user) throw new Error("Missing required data");

      const { error } = await supabase
        .from("client_messages")
        .insert({
          organization_id: organization.id,
          client_id: clientId,
          subject: form.subject || null,
          content: form.content,
          message_type: form.message_type,
          visibility: form.visibility,
          sender_type: "staff",
          sender_id: user.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-messages", clientId] });
      toast({
        title: "Message created",
        description: "Your message has been posted",
      });
      setOpen(false);
      setForm({
        subject: "",
        content: "",
        message_type: "note",
        visibility: "client_visible",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error creating message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMessageMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <MessageCircle className="mr-2 h-4 w-4" />
          New Message
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
          <DialogDescription>
            Post a message, note, or email to this client
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Message Type</Label>
            <Select
              value={form.message_type}
              onValueChange={(value) => setForm({ ...form, message_type: value as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="message">Portal Message</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(form.message_type === "email" || form.message_type === "message") && (
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="Message subject..."
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="content">Message *</Label>
            <Textarea
              id="content"
              required
              placeholder="Write your message..."
              rows={6}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Visibility</Label>
            <RadioGroup
              value={form.visibility}
              onValueChange={(value) => setForm({ ...form, visibility: value as any })}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="client_visible" id="msg_client_visible" />
                <Label htmlFor="msg_client_visible" className="font-normal cursor-pointer">
                  Client-visible
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="internal_only" id="msg_internal_only" />
                <Label htmlFor="msg_internal_only" className="font-normal cursor-pointer">
                  Internal only
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMessageMutation.isPending}>
              {createMessageMutation.isPending ? "Posting..." : "Post Message"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
