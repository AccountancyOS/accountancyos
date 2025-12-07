import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import type { BookkeepingEntity } from "./EntitySelector";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { RuleConditionBuilder } from "./RuleConditionBuilder";
import { RuleActionBuilder } from "./RuleActionBuilder";
import { RuleTestRunDialog } from "./RuleTestRunDialog";
import {
  createBankRule,
  updateBankRule,
  type RuleCondition,
  type RuleAction,
} from "@/lib/bank-rules-service";

interface BankRuleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity;
  rule?: any;
}

export function BankRuleEditorDialog({
  open,
  onOpenChange,
  entity,
  rule,
}: BankRuleEditorDialogProps) {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [ruleName, setRuleName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [conditions, setConditions] = useState<RuleCondition[]>([]);
  const [actions, setActions] = useState<RuleAction[]>([]);
  const [testRunOpen, setTestRunOpen] = useState(false);

  // Load existing rule data
  useEffect(() => {
    if (rule) {
      setRuleName(rule.rule_name || "");
      setDescription(rule.description || "");
      setIsActive(rule.is_active ?? true);
      setConditions((rule.conditions as RuleCondition[]) || []);
      setActions((rule.actions as RuleAction[]) || []);
    } else {
      // Reset form
      setRuleName("");
      setDescription("");
      setIsActive(true);
      setConditions([]);
      setActions([]);
    }
  }, [rule, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");
      if (!ruleName.trim()) throw new Error("Rule name is required");
      if (conditions.length === 0) throw new Error("At least one condition is required");
      if (actions.length === 0) throw new Error("At least one action is required");

      const input = {
        ruleName,
        description: description || undefined,
        conditions,
        actions,
        isActive,
      };

      if (rule?.id) {
        const result = await updateBankRule(rule.id, input);
        if (!result.success) throw new Error(result.error);
      } else {
        const result = await createBankRule(
          organization.id,
          entity.type,
          entity.id,
          input,
          user?.id
        );
        if (!result.success) throw new Error(result.error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-rules"] });
      toast.success(rule ? "Rule updated" : "Rule created");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to save rule", { description: error.message });
    },
  });

  const handleTestRun = () => {
    // Create temporary rule object for test
    setTestRunOpen(true);
  };

  const tempRuleForTest = {
    id: rule?.id || "temp",
    rule_name: ruleName,
    conditions,
    actions,
    is_active: true,
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{rule ? "Edit" : "New"} Bank Rule</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rule Name *</Label>
                <Input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g., Categorize Amazon purchases"
                />
              </div>

              <div className="space-y-2 flex items-end">
                <div className="flex items-center gap-2">
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                  <Label>Active</Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of what this rule does..."
                rows={2}
              />
            </div>

            {/* Conditions */}
            <div className="space-y-2">
              <Label>Conditions (When a transaction matches ALL of these)</Label>
              <RuleConditionBuilder
                conditions={conditions}
                onConditionsChange={setConditions}
                entity={entity}
              />
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <Label>Actions (Apply these changes)</Label>
              <RuleActionBuilder
                actions={actions}
                onActionsChange={setActions}
                entity={entity}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleTestRun}
              disabled={conditions.length === 0}
            >
              <Play className="h-4 w-4 mr-2" />
              Test Rule
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {rule ? "Update" : "Create"} Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {testRunOpen && (
        <RuleTestRunDialog
          open={testRunOpen}
          onOpenChange={setTestRunOpen}
          rule={tempRuleForTest}
          entity={entity}
        />
      )}
    </>
  );
}
