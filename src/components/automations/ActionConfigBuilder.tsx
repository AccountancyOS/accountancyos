import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlaceholderPicker } from "./PlaceholderPicker";
import { useRef } from "react";

interface ActionConfigBuilderProps {
  actionType: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

const SERVICE_TYPES = [
  { value: "accounts", label: "Annual Accounts" },
  { value: "corporation_tax", label: "Corporation Tax" },
  { value: "self_assessment", label: "Self Assessment" },
  { value: "vat", label: "VAT" },
  { value: "bookkeeping", label: "Bookkeeping" },
  { value: "payroll", label: "Payroll" },
  { value: "cis", label: "CIS" },
  { value: "company_secretarial", label: "Company Secretarial" },
  { value: "advisory", label: "Advisory" },
];

const TASK_VISIBILITY = [
  { value: "internal", label: "Internal Only" },
  { value: "client", label: "Visible to Client" },
];

const NOTIFICATION_TYPES = [
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
];

export function ActionConfigBuilder({ actionType, config, onChange }: ActionConfigBuilderProps) {
  const jobNameRef = useRef<HTMLInputElement>(null);
  const taskTitleRef = useRef<HTMLInputElement>(null);
  const taskDescRef = useRef<HTMLTextAreaElement>(null);
  const emailSubjectRef = useRef<HTMLInputElement>(null);
  const emailToRef = useRef<HTMLInputElement>(null);
  const notifTitleRef = useRef<HTMLInputElement>(null);
  const notifMessageRef = useRef<HTMLTextAreaElement>(null);

  const updateConfig = (key: string, value: unknown) => {
    onChange({ ...config, [key]: value });
  };

  const insertAtCursor = (ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>, key: string, placeholder: string) => {
    const el = ref.current;
    if (!el) {
      updateConfig(key, ((config[key] as string) || "") + placeholder);
      return;
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const currentValue = (config[key] as string) || "";
    const newValue = currentValue.slice(0, start) + placeholder + currentValue.slice(end);
    updateConfig(key, newValue);
    // Restore cursor position after React re-render
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + placeholder.length, start + placeholder.length);
    }, 0);
  };

  switch (actionType) {
    case "create_job":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="jobName">Job Name</Label>
              <PlaceholderPicker onInsert={(p) => insertAtCursor(jobNameRef, "jobName", p)} />
            </div>
            <Input
              ref={jobNameRef}
              id="jobName"
              value={(config.jobName as string) || ""}
              onChange={(e) => updateConfig("jobName", e.target.value)}
              placeholder="e.g. {{company.name}} - Annual Accounts {{period}}"
            />
          </div>
          <div className="space-y-2">
            <Label>Service Type *</Label>
            <Select
              value={(config.serviceType as string) || ""}
              onValueChange={(v) => updateConfig("serviceType", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select service type" />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Required for job creation</p>
          </div>
        </div>
      );

    case "create_task":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="taskTitle">Task Title</Label>
              <PlaceholderPicker onInsert={(p) => insertAtCursor(taskTitleRef, "title", p)} />
            </div>
            <Input
              ref={taskTitleRef}
              id="taskTitle"
              value={(config.title as string) || ""}
              onChange={(e) => updateConfig("title", e.target.value)}
              placeholder="e.g. Review {{client.name}} documents"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="taskDesc">Description (optional)</Label>
              <PlaceholderPicker onInsert={(p) => insertAtCursor(taskDescRef, "description", p)} />
            </div>
            <Textarea
              ref={taskDescRef}
              id="taskDesc"
              value={(config.description as string) || ""}
              onChange={(e) => updateConfig("description", e.target.value)}
              placeholder="Task description with placeholders..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Visibility</Label>
            <Select
              value={(config.visibility as string) || "internal"}
              onValueChange={(v) => updateConfig("visibility", v)}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_VISIBILITY.map((v) => (
                  <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case "send_email":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="toEmail">To Email</Label>
              <PlaceholderPicker onInsert={(p) => insertAtCursor(emailToRef, "toEmail", p)} />
            </div>
            <Input
              ref={emailToRef}
              id="toEmail"
              value={(config.toEmail as string) || ""}
              onChange={(e) => updateConfig("toEmail", e.target.value)}
              placeholder="e.g. {{client.email}}"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="subject">Subject</Label>
              <PlaceholderPicker onInsert={(p) => insertAtCursor(emailSubjectRef, "subject", p)} />
            </div>
            <Input
              ref={emailSubjectRef}
              id="subject"
              value={(config.subject as string) || ""}
              onChange={(e) => updateConfig("subject", e.target.value)}
              placeholder="e.g. Reminder: {{deadline.name}} due soon"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Email body will be pulled from the selected email template.
          </p>
        </div>
      );

    case "send_notification":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="notifTitle">Notification Title</Label>
              <PlaceholderPicker onInsert={(p) => insertAtCursor(notifTitleRef, "title", p)} />
            </div>
            <Input
              ref={notifTitleRef}
              id="notifTitle"
              value={(config.title as string) || ""}
              onChange={(e) => updateConfig("title", e.target.value)}
              placeholder="e.g. Job Completed: {{job.name}}"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="notifMessage">Message</Label>
              <PlaceholderPicker onInsert={(p) => insertAtCursor(notifMessageRef, "message", p)} />
            </div>
            <Textarea
              ref={notifMessageRef}
              id="notifMessage"
              value={(config.message as string) || ""}
              onChange={(e) => updateConfig("message", e.target.value)}
              placeholder="Notification message with placeholders..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Notification Type</Label>
            <Select
              value={(config.notificationType as string) || "info"}
              onValueChange={(v) => updateConfig("notificationType", v)}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTIFICATION_TYPES.map((n) => (
                  <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    default:
      return (
        <p className="text-sm text-muted-foreground">
          Select an action type to configure parameters.
        </p>
      );
  }
}
