/**
 * Reusable money field for SA schedule editors.
 * Renders a labelled input that formats as GBP.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: number;
  onChange?: (val: number) => void;
  readonly?: boolean;
  help?: string;
  bold?: boolean;
  className?: string;
}

export function SAMoneyField({ label, value, onChange, readonly, help, bold, className }: Props) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className={cn("text-sm", bold && "font-semibold")}>{label}</Label>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">£</span>
        <Input
          type="number"
          step="0.01"
          min="0"
          className={cn("pl-7 text-right", readonly && "bg-muted")}
          value={value || 0}
          onChange={(e) => onChange?.(parseFloat(e.target.value) || 0)}
          readOnly={readonly}
          disabled={readonly}
        />
      </div>
    </div>
  );
}
