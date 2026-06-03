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
import { Loader2 } from "lucide-react";

interface CompanyTextFieldEditorProps {
  companyId: string;
  field: "utr" | "auth_code" | "companies_house_auth_code";
  label: string;
  description?: string;
  currentValue?: string | null;
  placeholder?: string;
  uppercase?: boolean;
  validate?: (value: string) => string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function CompanyTextFieldEditor({
  companyId,
  field,
  label,
  description,
  currentValue,
  placeholder,
  uppercase,
  validate,
  open,
  onOpenChange,
  onSaved,
}: CompanyTextFieldEditorProps) {
  const { toast } = useToast();
  const [value, setValue] = useState<string>(currentValue || "");
  const [warning, setWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(currentValue || "");
      setWarning(null);
    }
  }, [open, currentValue]);

  const handleChange = (raw: string) => {
    const next = uppercase ? raw.toUpperCase() : raw;
    setValue(next);
    if (validate && next.trim()) {
      setWarning(validate(next.trim()));
    } else {
      setWarning(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmed = value.trim();
      const { error } = await supabase
        .from("companies")
        .update({ [field]: trimmed === "" ? null : trimmed })
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

        <div className="space-y-2 py-4">
          <Label htmlFor="company-text-field">{label}</Label>
          <Input
            id="company-text-field"
            value={value}
            placeholder={placeholder}
            onChange={(e) => handleChange(e.target.value)}
            className="font-mono"
            autoFocus
          />
          {warning && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{warning}</p>
          )}
          <p className="text-xs text-muted-foreground">Leave blank to clear.</p>
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