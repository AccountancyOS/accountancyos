import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface RegisteredOfficeCorrectionDialogProps {
  companyId: string;
  currentNote?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * The registered office (registered_office_address) is Companies-House
 * authoritative and read-only here -- it is only ever written by accepting a
 * diff at /settings/companies-house/diffs. This dialog does NOT edit that
 * address; it records a note that the firm believes it's wrong, so staff see
 * a flag until the underlying CH filing is corrected.
 */
export function RegisteredOfficeCorrectionDialog({
  companyId,
  currentNote,
  open,
  onOpenChange,
  onSaved,
}: RegisteredOfficeCorrectionDialogProps) {
  const { toast } = useToast();
  const [note, setNote] = useState(currentNote || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setNote(currentNote || "");
  }, [open, currentNote]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmed = note.trim();
      // registered_office_dispute_note is not yet in the generated Supabase types (migration
      // pending live application) -- see the same pattern in CompanyProfilePanel.tsx.
      const { error } = await supabase
        .from("companies")
        .update({ registered_office_dispute_note: trimmed === "" ? null : trimmed } as never)
        .eq("id", companyId);
      if (error) throw error;
      toast({ title: trimmed ? "Correction flagged" : "Flag cleared" });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Failed to save flag",
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
          <DialogTitle>Flag a correction</DialogTitle>
          <DialogDescription>
            The registered office shown here comes directly from Companies House and can't be
            edited from AccountancyOS. If you believe it's wrong, record a note below for other
            staff to see. The register itself is only corrected by filing a change of registered
            office address at Companies House -- once that filing is processed, the next sync
            (or accepting the diff at Settings &rarr; Companies House Diffs) will update this
            record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="ro-dispute-note">Note</Label>
          <Textarea
            id="ro-dispute-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. client says they moved office in March, CH record not yet updated"
            rows={4}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">Leave blank and save to clear the flag.</p>
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
