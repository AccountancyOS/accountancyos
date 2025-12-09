import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TriggerConfigBuilder } from "./TriggerConfigBuilder";
import { ActionConfigBuilder } from "./ActionConfigBuilder";
import { Zap, Play, Save } from "lucide-react";

interface AutomationTemplateContent {
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  description?: string;
  category?: string;
}

interface AutomationTemplateBuilderProps {
  content: AutomationTemplateContent;
  onChange: (content: AutomationTemplateContent) => void;
}

const TRIGGER_TYPES = [
  { value: "job_status_change", label: "Job Status Change", description: "When a job's status changes" },
  { value: "deadline_approaching", label: "Deadline Approaching", description: "When a deadline is X days away" },
  { value: "filing_status_change", label: "Filing Status Change", description: "When a filing's status changes" },
  { value: "client_onboarded", label: "Client Onboarded", description: "When a client completes onboarding" },
  { value: "onboarding_approved", label: "Onboarding Approved", description: "When onboarding is approved" },
];

const ACTION_TYPES = [
  { value: "create_job", label: "Create Job", description: "Create a new job" },
  { value: "create_task", label: "Create Task", description: "Create a new task" },
  { value: "send_email", label: "Send Email", description: "Queue an email" },
  { value: "send_notification", label: "Send Notification", description: "Send in-app notification" },
];

const CATEGORIES = [
  { value: "deadlines", label: "Deadlines" },
  { value: "jobs", label: "Jobs" },
  { value: "filings", label: "Filings" },
  { value: "onboarding", label: "Onboarding" },
  { value: "payroll", label: "Payroll" },
  { value: "general", label: "General" },
];

export function AutomationTemplateBuilder({ content, onChange }: AutomationTemplateBuilderProps) {
  const [triggerType, setTriggerType] = useState(content.trigger_type || "");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(content.trigger_config || {});
  const [actionType, setActionType] = useState(content.action_type || "");
  const [actionConfig, setActionConfig] = useState<Record<string, unknown>>(content.action_config || {});
  const [category, setCategory] = useState(content.category || "general");
  const [description, setDescription] = useState(content.description || "");

  useEffect(() => {
    onChange({
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      action_type: actionType,
      action_config: actionConfig,
      category,
      description,
    });
  }, [triggerType, triggerConfig, actionType, actionConfig, category, description]);

  return (
    <div className="space-y-6">
      {/* Template Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Template Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Template Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this automation template does..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Trigger Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="h-4 w-4" />
            When this happens...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Trigger Type</Label>
            <Select value={triggerType} onValueChange={(v) => {
              setTriggerType(v);
              setTriggerConfig({});
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select trigger" />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <div>
                      <div className="font-medium">{t.label}</div>
                      <div className="text-xs text-muted-foreground">{t.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {triggerType && (
            <TriggerConfigBuilder
              triggerType={triggerType}
              config={triggerConfig}
              onChange={setTriggerConfig}
            />
          )}
        </CardContent>
      </Card>

      {/* Action Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Do this...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Action Type</Label>
            <Select value={actionType} onValueChange={(v) => {
              setActionType(v);
              setActionConfig({});
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select action" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    <div>
                      <div className="font-medium">{a.label}</div>
                      <div className="text-xs text-muted-foreground">{a.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {actionType && (
            <ActionConfigBuilder
              actionType={actionType}
              config={actionConfig}
              onChange={setActionConfig}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
