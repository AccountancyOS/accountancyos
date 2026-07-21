import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Loader2 } from "lucide-react";

/** Same jsonb shape companies-house-sync writes for registered_office_address
 *  (address_line_1/address_line_2/locality/postal_code/country) -- reused here
 *  for the firm-owned trading/correspondence address so both jsonb address
 *  columns on `companies` share one shape. */
export interface CompanyAddressJson {
  address_line_1?: string | null;
  address_line_2?: string | null;
  locality?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

interface CompanyAddressFieldEditorProps {
  companyId: string;
  /** jsonb column on `companies` to write to, e.g. "trading_address". */
  field: "trading_address";
  label: string;
  description?: string;
  currentValue?: CompanyAddressJson | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const EMPTY: CompanyAddressJson = {
  address_line_1: "",
  address_line_2: "",
  locality: "",
  postal_code: "",
  country: "",
};

export function CompanyAddressFieldEditor({
  companyId,
  field,
  label,
  description,
  currentValue,
  open,
  onOpenChange,
  onSaved,
}: CompanyAddressFieldEditorProps) {
  const { toast } = useToast();
  const [value, setValue] = useState<CompanyAddressJson>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue({ ...EMPTY, ...(currentValue || {}) });
    }
  }, [open, currentValue]);

  const setPart = (key: keyof CompanyAddressJson, raw: string) => {
    setValue((prev) => ({ ...prev, [key]: raw }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmed: CompanyAddressJson = {
        address_line_1: value.address_line_1?.trim() || undefined,
        address_line_2: value.address_line_2?.trim() || undefined,
        locality: value.locality?.trim() || undefined,
        postal_code: value.postal_code?.trim() || undefined,
        country: value.country?.trim() || undefined,
      };
      const hasAnyValue = Object.values(trimmed).some((v) => v);
      // jsonb columns don't structurally match the generated `Json` union without a cast.
      const jsonValue = hasAnyValue ? (trimmed as unknown as Json) : null;
      const { error } = await supabase
        .from("companies")
        .update({ [field]: jsonValue })
        .eq("id", companyId);
      if (error) throw error;
      toast({ title: `${label} updated` });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: `Failed to update ${label}`,
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {label}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="addr-line-1">Address line 1</Label>
            <Input
              id="addr-line-1"
              value={value.address_line_1 ?? ""}
              onChange={(e) => setPart("address_line_1", e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addr-line-2">Address line 2</Label>
            <Input
              id="addr-line-2"
              value={value.address_line_2 ?? ""}
              onChange={(e) => setPart("address_line_2", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="addr-locality">Town / City</Label>
              <Input
                id="addr-locality"
                value={value.locality ?? ""}
                onChange={(e) => setPart("locality", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addr-postcode">Postcode</Label>
              <Input
                id="addr-postcode"
                value={value.postal_code ?? ""}
                onChange={(e) => setPart("postal_code", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addr-country">Country</Label>
            <Input
              id="addr-country"
              value={value.country ?? ""}
              onChange={(e) => setPart("country", e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">Leave all fields blank to clear.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
