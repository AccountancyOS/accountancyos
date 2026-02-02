import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLIENT_TYPES,
  CLIENT_TYPE_LABELS,
  CLIENT_TYPE_DESCRIPTIONS,
  type ClientType,
} from "@/lib/client-types";

interface ClientTypeSelectorProps {
  value: ClientType;
  onChange: (value: ClientType) => void;
  disabled?: boolean;
}

export function ClientTypeSelector({
  value,
  onChange,
  disabled = false,
}: ClientTypeSelectorProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="client_type">Client Type</Label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as ClientType)}
        disabled={disabled}
      >
        <SelectTrigger id="client_type">
          <SelectValue placeholder="Select client type" />
        </SelectTrigger>
        <SelectContent>
          {CLIENT_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              <div className="flex flex-col">
                <span>{CLIENT_TYPE_LABELS[type]}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <p className="text-xs text-muted-foreground">
          {CLIENT_TYPE_DESCRIPTIONS[value]}
        </p>
      )}
    </div>
  );
}
