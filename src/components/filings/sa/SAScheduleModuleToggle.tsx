/**
 * Module toggle panel — allows accountant to enable/disable SA schedule sections.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SA_SCHEDULE_MODULE_KEYS, type SAScheduleModuleKey } from "@/lib/sa-schedule-engine";

const MODULE_LABELS: Record<SAScheduleModuleKey, string> = {
  employment: "Employment Income",
  self_employment: "Self-Employment",
  property: "Property Income",
  dividends: "Dividends",
  interest: "Interest Income",
  unit_trust_income: "Unit Trust Income",
  pension_income: "Pension Income",
  chargeable_event_gains: "Chargeable Event Gains",
  trust_estate_income: "Trust & Estate Income",
  cgt: "Capital Gains Tax",
  reliefs: "Reliefs & Deductions",
  adjustments: "Adjustments",
};

interface Props {
  enabledModules: SAScheduleModuleKey[];
  onToggle: (key: SAScheduleModuleKey, enabled: boolean) => void;
  disabled?: boolean;
}

export function SAScheduleModuleToggle({ enabledModules, onToggle, disabled }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Schedule Modules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {SA_SCHEDULE_MODULE_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between">
            <Label htmlFor={`toggle-${key}`} className="text-sm cursor-pointer">
              {MODULE_LABELS[key]}
            </Label>
            <Switch
              id={`toggle-${key}`}
              checked={enabledModules.includes(key)}
              onCheckedChange={(checked) => onToggle(key, checked)}
              disabled={disabled}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
