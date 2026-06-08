import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, ChevronUp, ChevronDown, Wand2, Trash2, Pencil, Play } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { BankRuleEditorDialog } from "./BankRuleEditorDialog";
import { RuleTestRunDialog } from "./RuleTestRunDialog";
import { BookkeepingEmptyState } from "./BookkeepingEmptyState";
import { BankRulesPreviewPanel } from "./BankRulesPreviewPanel";

interface BankRulesTabProps {
  entity: BookkeepingEntity | null;
}

export function BankRulesTab({ entity }: BankRulesTabProps) {
  const [bankAccountFilter, setBankAccountFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [testRunOpen, setTestRunOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<any>(null);
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  if (!entity) {
    return (
      <BookkeepingEmptyState
        icon={Wand2}
        title="No entity selected"
        description="Select a client or company above to view bank rules"
      />
    );
  }

  const { data: bankAccounts } = useQuery({
    queryKey: ["bank-accounts-for-rules", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const query = supabase
        .from("bank_accounts")
        .select("id, name")
        .eq("organization_id", organization.id)
        .eq("is_active", true);

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data } = await query.order("name");
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const { data: rules, isLoading } = useQuery({
    queryKey: ["bank-rules", organization?.id, entity.type, entity.id, bankAccountFilter],
    queryFn: async () => {
      if (!organization?.id) return [];

      const query = supabase
        .from("bank_rules")
        .select("*")
        .eq("organization_id", organization.id)
        .order("priority");

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ ruleId, isActive }: { ruleId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("bank_rules")
        .update({ is_active: isActive })
        .eq("id", ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-rules"] });
    },
    onError: (error) => {
      toast.error("Failed to update rule", { description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase.from("bank_rules").delete().eq("id", ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-rules"] });
      toast.success("Rule deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete rule", { description: error.message });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ ruleId, direction }: { ruleId: string; direction: "up" | "down" }) => {
      const currentIndex = rules?.findIndex((r) => r.id === ruleId) ?? -1;
      if (currentIndex === -1) return;

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= (rules?.length ?? 0)) return;

      const currentRule = rules![currentIndex];
      const targetRule = rules![targetIndex];

      // Swap priorities
      await Promise.all([
        supabase
          .from("bank_rules")
          .update({ priority: targetRule.priority })
          .eq("id", currentRule.id),
        supabase
          .from("bank_rules")
          .update({ priority: currentRule.priority })
          .eq("id", targetRule.id),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-rules"] });
    },
    onError: (error) => {
      toast.error("Failed to reorder rule", { description: error.message });
    },
  });

  const formatConditions = (conditions: any) => {
    if (!conditions || !Array.isArray(conditions)) return "No conditions";
    return conditions.map((c: any) => `${c.field} ${c.operator} "${c.value}"`).join(", ");
  };

  const formatActions = (actions: any) => {
    if (!actions || !Array.isArray(actions)) return "No actions";
    return actions.map((a: any) => `${a.type}: ${a.value}`).join(", ");
  };

  const handleNew = () => {
    setSelectedRule(null);
    setEditorOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bank Rules</h2>
          <p className="text-sm text-muted-foreground">
            Automate categorization of bank transactions
          </p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Rule
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium">Bank Account</label>
          <Select value={bankAccountFilter} onValueChange={setBankAccountFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {bankAccounts?.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Rules Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground">Loading rules...</p>
        </div>
      ) : !rules || rules.length === 0 ? (
        <BookkeepingEmptyState
          icon={Wand2}
          title="No bank rules yet"
          description="Create rules to automatically categorize and code bank transactions as they come in"
          actionLabel="Create Rule"
          onAction={handleNew}
        />
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Order</TableHead>
                <TableHead>Rule Name</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead className="text-center">Applied</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule, index) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === 0}
                        onClick={() => reorderMutation.mutate({ ruleId: rule.id, direction: "up" })}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === rules.length - 1}
                        onClick={() => reorderMutation.mutate({ ruleId: rule.id, direction: "down" })}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{rule.rule_name}</p>
                      {rule.description && (
                        <p className="text-sm text-muted-foreground">{rule.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {formatConditions(rule.conditions)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {formatActions(rule.actions)}
                    </p>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{rule.times_applied || 0}</Badge>
                  </TableCell>
                  <TableCell>
                    {rule.last_applied_at ? (
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(rule.last_applied_at), "dd/MM/yyyy")}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={(checked) =>
                        toggleActiveMutation.mutate({ ruleId: rule.id, isActive: checked })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedRule(rule);
                            setEditorOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedRule(rule);
                            setTestRunOpen(true);
                          }}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Test Run
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            if (confirm("Delete this rule?")) {
                              deleteMutation.mutate(rule.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <BankRuleEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        entity={entity}
        rule={selectedRule}
      />

      {selectedRule && (
        <RuleTestRunDialog
          open={testRunOpen}
          onOpenChange={setTestRunOpen}
          rule={selectedRule}
          entity={entity}
        />
      )}
    </div>
  );
}
