import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TriggerConfigBuilder } from "./TriggerConfigBuilder";
import { ActionConfigBuilder } from "./ActionConfigBuilder";
import { Zap, Play, Save } from "lucide-react";

interface AutomationRule {
  id?: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  is_active: boolean;
}

interface AutomationRuleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: AutomationRule | null;
  onSave: (rule: AutomationRule) => void;
  isSaving?: boolean;
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

export function AutomationRuleEditor({
  open,
  onOpenChange,
  rule,
  onSave,
  isSaving,
}: AutomationRuleEditorProps) {
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>({});
  const [actionType, setActionType] = useState("");
  const [actionConfig, setActionConfig] = useState<Record<string, unknown>>({});
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setTriggerType(rule.trigger_type);
      setTriggerConfig(rule.trigger_config || {});
      setActionType(rule.action_type);
      setActionConfig(rule.action_config || {});
      setIsActive(rule.is_active);
    } else {
      setName("");
      setTriggerType("");
      setTriggerConfig({});
      setActionType("");
      setActionConfig({});
      setIsActive(true);
    }
  }, [rule, open]);

  const handleSave = () => {
    if (!name.trim() || !triggerType || !actionType) return;
    
    onSave({
      id: rule?.id,
      name: name.trim(),
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      action_type: actionType,
      action_config: actionConfig,
      is_active: isActive,
    });
  };

  const isValid = name.trim() && triggerType && actionType && 
    (actionType !== "create_job" || actionConfig.serviceType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            {rule?.id ? "Edit Automation Rule" : "Create Automation Rule"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ruleName">Rule Name *</Label>
              <Input
                id="ruleName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Auto-create job before deadline"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="isActive" />
              <Label htmlFor="isActive" className="cursor-pointer">
                Rule is active
              </Label>
            </div>
          </div>

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
                <Label>Trigger Type *</Label>
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
                <Label>Action Type *</Label>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
