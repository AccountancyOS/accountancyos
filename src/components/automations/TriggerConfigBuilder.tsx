import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TriggerConfigBuilderProps {
  triggerType: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

const JOB_STATUSES = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting_on_client", label: "Waiting on Client" },
  { value: "ready_for_review", label: "Ready for Review" },
  { value: "in_review", label: "In Review" },
  { value: "completed", label: "Completed" },
];

const FILING_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "ready_to_file", label: "Ready to File" },
  { value: "awaiting_client_approval", label: "Awaiting Client Approval" },
  { value: "approved_by_client", label: "Approved by Client" },
  { value: "filed", label: "Filed" },
];

const DEADLINE_TYPES = [
  { value: "accounts_filing", label: "Accounts Filing" },
  { value: "confirmation_statement", label: "Confirmation Statement" },
  { value: "corporation_tax", label: "Corporation Tax" },
  { value: "vat_return", label: "VAT Return" },
  { value: "self_assessment", label: "Self Assessment" },
  { value: "payroll_rti", label: "Payroll RTI" },
  { value: "cis_return", label: "CIS Return" },
];

const FILING_TYPES = [
  { value: "accounts", label: "Annual Accounts" },
  { value: "confirmation_statement", label: "Confirmation Statement" },
  { value: "corporation_tax", label: "Corporation Tax (CT600)" },
  { value: "vat_return", label: "VAT Return" },
  { value: "self_assessment", label: "Self Assessment" },
];

export function TriggerConfigBuilder({ triggerType, config, onChange }: TriggerConfigBuilderProps) {
  const updateConfig = (key: string, value: unknown) => {
    onChange({ ...config, [key]: value });
  };

  switch (triggerType) {
    case "job_status_change":
      return (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>From Status (optional)</Label>
              <Select
                value={(config.fromStatus as string) || "_any"}
                onValueChange={(v) => updateConfig("fromStatus", v === "_any" ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Any status</SelectItem>
                  {JOB_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To Status</Label>
              <Select
                value={(config.toStatus as string) || "_any"}
                onValueChange={(v) => updateConfig("toStatus", v === "_any" ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Any status</SelectItem>
                  {JOB_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );

    case "deadline_approaching":
      return (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Days Before Deadline</Label>
              <Input
                type="number"
                min={0}
                max={365}
                value={(config.daysThreshold as number) ?? 14}
                onChange={(e) => updateConfig("daysThreshold", parseInt(e.target.value) || 0)}
                placeholder="14"
              />
              <p className="text-xs text-muted-foreground">
                Trigger when deadline is this many days away (0 = overdue)
              </p>
            </div>
            <div className="space-y-2">
              <Label>Deadline Type (optional)</Label>
              <Select
                value={(config.deadlineType as string) || "_any"}
                onValueChange={(v) => updateConfig("deadlineType", v === "_any" ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any deadline type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Any deadline type</SelectItem>
                  {DEADLINE_TYPES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );

    case "filing_status_change":
      return (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>From Status (optional)</Label>
              <Select
                value={(config.fromStatus as string) || "_any"}
                onValueChange={(v) => updateConfig("fromStatus", v === "_any" ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Any status</SelectItem>
                  {FILING_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To Status</Label>
              <Select
                value={(config.toStatus as string) || "_any"}
                onValueChange={(v) => updateConfig("toStatus", v === "_any" ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Any status</SelectItem>
                  {FILING_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Filing Type (optional)</Label>
              <Select
                value={(config.filingType as string) || "_any"}
                onValueChange={(v) => updateConfig("filingType", v === "_any" ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any filing type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Any filing type</SelectItem>
                  {FILING_TYPES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );

    case "client_onboarded":
    case "onboarding_approved":
      return (
        <div className="space-y-2">
          <Label>Client Type (optional)</Label>
          <Select
            value={(config.clientType as string) || "_any"}
            onValueChange={(v) => updateConfig("clientType", v === "_any" ? undefined : v)}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Any client type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_any">Any client type</SelectItem>
              <SelectItem value="individual">Individual</SelectItem>
              <SelectItem value="company">Company</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );

    default:
      return (
        <p className="text-sm text-muted-foreground">
          Select a trigger type to configure conditions.
        </p>
      );
  }
}
