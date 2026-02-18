import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import type { RuleAction } from "@/lib/bank-rules-service";
import type { BookkeepingEntity } from "./EntitySelector";
import { getVatCodeLabel } from "@/lib/vat-code-utils";

interface RuleActionBuilderProps {
  actions: RuleAction[];
  onActionsChange: (actions: RuleAction[]) => void;
  entity: BookkeepingEntity;
}

const ACTION_TYPES = [
  { value: "set_account", label: "Set Nominal Account" },
  { value: "set_vat_code", label: "Set VAT Code" },
  { value: "set_category", label: "Set Category" },
];

export function RuleActionBuilder({
  actions,
  onActionsChange,
  entity,
}: RuleActionBuilderProps) {
  const { organization } = useOrganization();

  // Fetch accounts
  const { data: accounts } = useQuery({
    queryKey: ["accounts-for-rules", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const query = supabase
        .from("bookkeeping_accounts")
        .select("id, code, name")
        .eq("organization_id", organization.id)
        .eq("is_active", true);

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data } = await query.order("code");
      return data || [];
    },
    enabled: !!organization?.id,
  });

  // Fetch VAT codes
  const { data: vatCodes } = useQuery({
    queryKey: ["vat-codes-for-rules", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data } = await supabase
        .from("vat_codes")
        .select("id, code, description, rate, is_common")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("code");
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const [showAllVatCodes, setShowAllVatCodes] = useState(false);

  const filteredVatCodes = useMemo(() => {
    if (!vatCodes) return [];
    return showAllVatCodes ? vatCodes : vatCodes.filter((v) => v.is_common);
  }, [vatCodes, showAllVatCodes]);

  const addAction = () => {
    onActionsChange([...actions, { type: "set_account", value: "" }]);
  };

  const removeAction = (index: number) => {
    onActionsChange(actions.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, updates: Partial<RuleAction>) => {
    onActionsChange(
      actions.map((a, i) => {
        if (i === index) {
          const updated = { ...a, ...updates };
          // Reset value if type changes
          if (updates.type && updates.type !== a.type) {
            updated.value = "";
          }
          return updated;
        }
        return a;
      })
    );
  };

  // Check for duplicate action types
  const getAvailableTypes = (currentIndex: number) => {
    const usedTypes = actions
      .filter((_, i) => i !== currentIndex)
      .map((a) => a.type);
    return ACTION_TYPES.filter((t) => !usedTypes.includes(t.value as RuleAction["type"]));
  };

  if (actions.length === 0) {
    return (
      <div className="border border-dashed rounded-lg p-4 text-center">
        <p className="text-sm text-muted-foreground mb-2">No actions defined</p>
        <Button variant="outline" size="sm" onClick={addAction}>
          <Plus className="h-4 w-4 mr-1" />
          Add Action
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {actions.map((action, index) => {
        const availableTypes = getAvailableTypes(index);
        const isAccount = action.type === "set_account";
        const isVatCode = action.type === "set_vat_code";

        return (
          <div key={index} className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
            {/* Action Type */}
            <Select
              value={action.type}
              onValueChange={(value) =>
                updateAction(index, { type: value as RuleAction["type"] })
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.filter(
                  (t) =>
                    t.value === action.type ||
                    availableTypes.some((at) => at.value === t.value)
                ).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Value */}
            {isAccount ? (
              <Select value={action.value} onValueChange={(value) => updateAction(index, { value })}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : isVatCode ? (
              <div className="flex-1 space-y-1">
                <Select value={action.value} onValueChange={(value) => updateAction(index, { value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select VAT code" />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const selectedVat = vatCodes?.find((v) => v.id === action.value);
                      const opts = selectedVat && !filteredVatCodes.some((v) => v.id === selectedVat.id)
                        ? [selectedVat, ...filteredVatCodes]
                        : filteredVatCodes;
                      return opts.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {getVatCodeLabel(v)}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline cursor-pointer"
                  onClick={() => setShowAllVatCodes((v) => !v)}
                >
                  {showAllVatCodes ? "Show common only" : "Show all codes"}
                </button>
              </div>
            ) : (
              <Input
                value={action.value}
                onChange={(e) => updateAction(index, { value: e.target.value })}
                placeholder="Category name..."
                className="flex-1"
              />
            )}

            {/* Remove */}
            <Button variant="ghost" size="icon" onClick={() => removeAction(index)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      })}

      {actions.length < ACTION_TYPES.length && (
        <Button variant="outline" size="sm" onClick={addAction}>
          <Plus className="h-4 w-4 mr-1" />
          Add Action
        </Button>
      )}
    </div>
  );
}
