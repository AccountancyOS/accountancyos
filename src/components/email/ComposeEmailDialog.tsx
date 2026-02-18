import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { queueEmailSafe, updateQueuedEmailSafe } from "@/lib/email-safe-service";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { 
  Send, 
  Clock, 
  Save, 
  ChevronDown, 
  Link2, 
  Mail,
  FileText,
  CalendarIcon,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { resolvePlaceholders, PlaceholderContext, getAvailablePlaceholders } from "@/lib/placeholder-resolver";
import { TemplatePickerDropdown } from "./TemplatePickerDropdown";
import { cn } from "@/lib/utils";

interface ComposeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTo?: string;
  defaultToName?: string;
  clientId?: string;
  companyId?: string;
  jobId?: string;
  filingId?: string;
}

export function ComposeEmailDialog({
  open,
  onOpenChange,
  defaultTo,
  defaultToName,
  clientId,
  companyId,
  jobId,
  filingId,
}: ComposeEmailDialogProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const [mailboxId, setMailboxId] = useState<string>("");
  const [toEmail, setToEmail] = useState(defaultTo || "");
  const [toName, setToName] = useState(defaultToName || "");
  const [ccEmails, setCcEmails] = useState("");
  const [bccEmails, setBccEmails] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>();
  const [showScheduler, setShowScheduler] = useState(false);

  // Fetch connected mailboxes
  const { data: mailboxes } = useQuery({
    queryKey: ["connected-mailboxes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connected_mailboxes_safe")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch entity context for placeholders
  const { data: entityContext } = useQuery({
    queryKey: ["email-compose-context", clientId, companyId, jobId],
    queryFn: async () => {
      const context: PlaceholderContext = { organization: { id: organization?.id, name: organization?.name } };

      if (clientId) {
        const { data: client } = await supabase
          .from("clients")
          .select("*")
          .eq("id", clientId)
          .single();
        if (client) {
          context.client = client;
          if (!toEmail && client.email) setToEmail(client.email);
          if (!toName) setToName(`${client.first_name} ${client.last_name}`);
        }
      }

      if (companyId) {
        const { data: company } = await supabase
          .from("companies")
          .select("*")
          .eq("id", companyId)
          .single();
        if (company) {
          context.company = company;
          if (!toEmail && company.email) setToEmail(company.email);
          if (!toName && !clientId) setToName(company.company_name);
        }
      }

      if (jobId) {
        const { data: job } = await supabase
          .from("jobs")
          .select("*")
          .eq("id", jobId)
          .single();
        if (job) {
          context.job = job;
        }
      }

      return context;
    },
    enabled: open && !!(clientId || companyId || jobId),
  });

  // Auto-select first mailbox
  useEffect(() => {
    if (mailboxes && mailboxes.length > 0 && !mailboxId) {
      setMailboxId(mailboxes[0].id);
    }
  }, [mailboxes, mailboxId]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSubject("");
      setBody("");
      setCcEmails("");
      setBccEmails("");
      setShowCcBcc(false);
      setScheduleDate(undefined);
      setShowScheduler(false);
    }
  }, [open]);

  // Update defaults when props change
  useEffect(() => {
    if (defaultTo) setToEmail(defaultTo);
    if (defaultToName) setToName(defaultToName);
  }, [defaultTo, defaultToName]);

  const sendMutation = useMutation({
    mutationFn: async (mode: "send" | "draft" | "schedule") => {
      if (!organization?.id) throw new Error("No organization");
      if (!toEmail) throw new Error("Recipient email is required");
      if (!subject) throw new Error("Subject is required");

      // Resolve placeholders
      const context = entityContext || { organization: { id: organization.id, name: organization.name } };
      const resolvedSubject = resolvePlaceholders(subject, context);
      const resolvedBody = resolvePlaceholders(body, context);

      const scheduledAt = mode === "schedule" && scheduleDate ? scheduleDate.toISOString() : undefined;

      // Use safe RPC to queue email
      const result = await queueEmailSafe(organization.id, {
        toEmail,
        toName: toName || undefined,
        subject: resolvedSubject,
        bodyHtml: resolvedBody,
        entityType: clientId ? 'client' : companyId ? 'company' : jobId ? 'job' : undefined,
        entityId: clientId || companyId || jobId || undefined,
        scheduledAt,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to queue email');
      }

      // If draft, update status to draft
      if (mode === "draft" && result.email_id) {
        await updateQueuedEmailSafe(result.email_id, { scheduledAt: undefined });
      }

      return mode;
    },
    onSuccess: (mode) => {
      queryClient.invalidateQueries({ queryKey: ["email-queue"] });
      const messages = {
        send: "Email queued for sending",
        draft: "Email saved as draft",
        schedule: `Email scheduled for ${scheduleDate ? format(scheduleDate, "PPp") : "later"}`,
      };
      toast.success(messages[mode]);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleTemplateSelect = (template: { subject: string; body: string }) => {
    setSubject(template.subject);
    setBody(template.body);
  };

  const insertPlaceholder = (placeholder: string) => {
    setBody((prev) => prev + placeholder);
  };

  const availablePlaceholders = getAvailablePlaceholders();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Compose Email
          </DialogTitle>
          <DialogDescription>
            Send an email from your connected mailbox
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* From */}
          <div className="space-y-2">
            <Label>From</Label>
            {mailboxes && mailboxes.length > 0 ? (
              <Select value={mailboxId} onValueChange={setMailboxId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select mailbox" />
                </SelectTrigger>
                <SelectContent>
                  {mailboxes.map((mailbox) => (
                    <SelectItem key={mailbox.id} value={mailbox.id}>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        <span>{mailbox.email_address}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {mailbox.provider}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">No mailbox connected</span>
                <Button variant="link" size="sm" className="p-0 h-auto" asChild>
                  <a href="/settings">Connect Mailbox</a>
                </Button>
              </div>
            )}
          </div>

          {/* To */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="to">To</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setShowCcBcc(!showCcBcc)}
              >
                <ChevronDown className={cn("h-3 w-3 mr-1 transition-transform", showCcBcc && "rotate-180")} />
                CC/BCC
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                id="to"
                type="email"
                placeholder="recipient@example.com"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                className="flex-1"
              />
              {toName && (
                <Badge variant="secondary" className="shrink-0">
                  {toName}
                </Badge>
              )}
            </div>
          </div>

          {/* CC/BCC */}
          <Collapsible open={showCcBcc}>
            <CollapsibleContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cc">CC</Label>
                <Input
                  id="cc"
                  placeholder="Separate multiple emails with commas"
                  value={ccEmails}
                  onChange={(e) => setCcEmails(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bcc">BCC</Label>
                <Input
                  id="bcc"
                  placeholder="Separate multiple emails with commas"
                  value={bccEmails}
                  onChange={(e) => setBccEmails(e.target.value)}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Template Picker */}
          <div className="flex items-center gap-2">
            <TemplatePickerDropdown onSelect={handleTemplateSelect} />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-2" />
                  Insert Placeholder
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {availablePlaceholders.map((group) => (
                    <div key={group.category}>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        {group.category}
                      </p>
                      <div className="space-y-1">
                        {group.placeholders.map((p) => (
                          <Button
                            key={p.key}
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-xs h-7"
                            onClick={() => insertPlaceholder(p.key)}
                          >
                            {p.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Email subject..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              placeholder="Write your email message here..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
          </div>

          {/* Entity Links */}
          {(clientId || companyId || jobId || filingId) && (
            <div className="flex items-center gap-2 flex-wrap">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Linked to:</span>
              {clientId && <Badge variant="outline">Client</Badge>}
              {companyId && <Badge variant="outline">Company</Badge>}
              {jobId && <Badge variant="outline">Job</Badge>}
              {filingId && <Badge variant="outline">Filing</Badge>}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 mr-auto">
            <Popover open={showScheduler} onOpenChange={setShowScheduler}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {scheduleDate ? format(scheduleDate, "PPp") : "Schedule"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={scheduleDate}
                  onSelect={(date) => {
                    setScheduleDate(date);
                    setShowScheduler(false);
                  }}
                  initialFocus
                  disabled={(date) => date < new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>

          <Button
            variant="outline"
            onClick={() => sendMutation.mutate("draft")}
            disabled={sendMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            Save Draft
          </Button>

          {scheduleDate ? (
            <Button
              onClick={() => sendMutation.mutate("schedule")}
              disabled={sendMutation.isPending || !toEmail || !subject}
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Clock className="h-4 w-4 mr-2" />
              )}
              Schedule Send
            </Button>
          ) : (
            <Button
              onClick={() => sendMutation.mutate("send")}
              disabled={sendMutation.isPending || !toEmail || !subject}
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Now
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
