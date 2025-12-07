import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import type { RuleCondition } from "@/lib/bank-rules-service";
import type { BookkeepingEntity } from "./EntitySelector";

interface RuleConditionBuilderProps {
  conditions: RuleCondition[];
  onConditionsChange: (conditions: RuleCondition[]) => void;
  entity: BookkeepingEntity;
}

const FIELD_OPTIONS = [
  { value: "description", label: "Description" },
  { value: "amount", label: "Amount" },
  { value: "direction", label: "Direction" },
];

const OPERATOR_OPTIONS: Record<string, { value: string; label: string }[]> = {
  description: [
    { value: "contains", label: "Contains" },
    { value: "starts_with", label: "Starts with" },
    { value: "ends_with", label: "Ends with" },
    { value: "equals", label: "Equals" },
  ],
  amount: [
    { value: "equals", label: "Equals" },
    { value: "greater_than", label: "Greater than" },
    { value: "less_than", label: "Less than" },
    { value: "between", label: "Between" },
  ],
  direction: [
    { value: "equals", label: "Equals" },
  ],
};

const DIRECTION_VALUES = [
  { value: "in", label: "Money In" },
  { value: "out", label: "Money Out" },
];

export function RuleConditionBuilder({
  conditions,
  onConditionsChange,
  entity,
}: RuleConditionBuilderProps) {
  const addCondition = () => {
    onConditionsChange([
      ...conditions,
      { field: "description", operator: "contains", value: "" },
    ]);
  };

  const removeCondition = (index: number) => {
    onConditionsChange(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, updates: Partial<RuleCondition>) => {
    onConditionsChange(
      conditions.map((c, i) => {
        if (i === index) {
          const updated = { ...c, ...updates };
          // Reset operator if field changes
          if (updates.field && updates.field !== c.field) {
            updated.operator = OPERATOR_OPTIONS[updates.field]?.[0]?.value as any || "contains";
            updated.value = "";
            updated.value2 = undefined;
          }
          return updated;
        }
        return c;
      })
    );
  };

  if (conditions.length === 0) {
    return (
      <div className="border border-dashed rounded-lg p-4 text-center">
        <p className="text-sm text-muted-foreground mb-2">No conditions defined</p>
        <Button variant="outline" size="sm" onClick={addCondition}>
          <Plus className="h-4 w-4 mr-1" />
          Add Condition
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {conditions.map((condition, index) => {
        const operators = OPERATOR_OPTIONS[condition.field] || OPERATOR_OPTIONS.description;
        const showValue2 = condition.operator === "between";
        const isDirection = condition.field === "direction";
        const isAmount = condition.field === "amount";

        return (
          <div key={index} className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
            {index > 0 && (
              <Badge variant="secondary" className="mr-2">
                AND
              </Badge>
            )}

            {/* Field */}
            <Select
              value={condition.field}
              onValueChange={(value) =>
                updateCondition(index, { field: value as RuleCondition["field"] })
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Operator */}
            <Select
              value={condition.operator}
              onValueChange={(value) =>
                updateCondition(index, { operator: value as RuleCondition["operator"] })
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operators.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Value */}
            {isDirection ? (
              <Select
                value={String(condition.value)}
                onValueChange={(value) => updateCondition(index, { value })}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTION_VALUES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type={isAmount ? "number" : "text"}
                step={isAmount ? "0.01" : undefined}
                value={condition.value}
                onChange={(e) =>
                  updateCondition(index, {
                    value: isAmount ? Number(e.target.value) : e.target.value,
                  })
                }
                placeholder={isAmount ? "0.00" : "Value..."}
                className="w-[140px]"
              />
            )}

            {/* Value2 for between */}
            {showValue2 && (
              <>
                <span className="text-sm text-muted-foreground">and</span>
                <Input
                  type="number"
                  step="0.01"
                  value={condition.value2 || ""}
                  onChange={(e) => updateCondition(index, { value2: Number(e.target.value) })}
                  placeholder="0.00"
                  className="w-[100px]"
                />
              </>
            )}

            {/* Remove */}
            <Button variant="ghost" size="icon" onClick={() => removeCondition(index)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      })}

      <Button variant="outline" size="sm" onClick={addCondition}>
        <Plus className="h-4 w-4 mr-1" />
        Add Condition
      </Button>
    </div>
  );
}
