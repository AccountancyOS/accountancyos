/**
 * TBImportButton — Override-aware TB import for FRS105 balance sheet.
 * Shows a confirmation dialog when manual_override lines would be overwritten.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload, Loader2, AlertTriangle } from "lucide-react";
import type { FRS105BalanceSheetDraft, BalanceSheetLineValue } from "@/types/filing-schemas";

interface TBImportButtonProps {
  currentBalanceSheet: FRS105BalanceSheetDraft;
  onImport: (updated: FRS105BalanceSheetDraft) => void;
  disabled?: boolean;
}

/** Lines that carry a BalanceSheetLineValue (not computed subtotals) */
const IMPORTABLE_LINES: Array<{ key: keyof FRS105BalanceSheetDraft; label: string }> = [
  { key: "tangible_assets", label: "Tangible Assets" },
  { key: "debtors", label: "Debtors" },
  { key: "cash_at_bank", label: "Cash at Bank" },
  { key: "creditors_within_one_year", label: "Creditors < 1 year" },
  { key: "creditors_after_one_year", label: "Creditors > 1 year" },
  { key: "share_capital", label: "Share Capital" },
  { key: "retained_earnings", label: "Retained Earnings" },
];

function isLineValue(v: unknown): v is BalanceSheetLineValue {
  return typeof v === "object" && v !== null && "amount" in v && "source" in v;
}

/**
 * Simulates pulling TB data. In production this would call mapWorkpaperToAccountsModel
 * or read from a TB snapshot. For now it returns null to indicate "no TB data available".
 */
function fetchTBData(): FRS105BalanceSheetDraft | null {
  // TODO: integrate with accounts-model-mapper.ts mapWorkpaperToAccountsModel()
  // For now, return null — the button will show a "no TB data" message.
  return null;
}

export function TBImportButton({ currentBalanceSheet, onImport, disabled }: TBImportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [overriddenLines, setOverriddenLines] = useState<Array<{ key: keyof FRS105BalanceSheetDraft; label: string }>>([]);
  const [selectedOverrides, setSelectedOverrides] = useState<Set<string>>(new Set());
  const [tbData, setTbData] = useState<FRS105BalanceSheetDraft | null>(null);

  const handleClick = async () => {
    setLoading(true);
    try {
      const data = fetchTBData();
      if (!data) {
        // No TB data available yet
        setLoading(false);
        return;
      }
      setTbData(data);

      // Find lines currently marked as manual_override
      const manualLines = IMPORTABLE_LINES.filter((line) => {
        const current = currentBalanceSheet[line.key];
        return isLineValue(current) && current.source === "manual_override";
      });

      if (manualLines.length === 0) {
        // No conflicts — import directly
        applyImport(data, new Set(IMPORTABLE_LINES.map((l) => l.key)));
      } else {
        // Show confirmation dialog
        setOverriddenLines(manualLines);
        setSelectedOverrides(new Set());
        setDialogOpen(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const applyImport = (data: FRS105BalanceSheetDraft, linesToUpdate: Set<string>) => {
    const merged = { ...currentBalanceSheet };

    for (const line of IMPORTABLE_LINES) {
      if (!linesToUpdate.has(line.key)) continue;
      const currentVal = currentBalanceSheet[line.key];
      // Skip manual_override lines unless explicitly selected
      if (isLineValue(currentVal) && currentVal.source === "manual_override" && !selectedOverrides.has(line.key)) {
        continue;
      }
      const tbVal = data[line.key];
      if (isLineValue(tbVal)) {
        (merged as any)[line.key] = { ...tbVal, source: "derived" as const };
      }
    }

    onImport(merged);
    setDialogOpen(false);
  };

  const toggleOverride = (key: string) => {
    setSelectedOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const confirmImport = () => {
    if (!tbData) return;
    // Import all non-override lines + selected override lines
    const allKeys = new Set(IMPORTABLE_LINES.map((l) => l.key as string));
    applyImport(tbData, allKeys);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={disabled || loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-1" />
        ) : (
          <Upload className="h-4 w-4 mr-1" />
        )}
        Import from TB
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Manual Overrides Detected
            </DialogTitle>
            <DialogDescription>
              The following lines have been manually overridden. Select which ones
              you want to replace with TB data. Unselected lines will keep their
              current values.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {overriddenLines.map((line) => {
              const current = currentBalanceSheet[line.key];
              const currentAmount = isLineValue(current) ? current.amount : 0;
              return (
                <label
                  key={line.key}
                  className="flex items-center gap-3 p-2 rounded border cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedOverrides.has(line.key)}
                    onCheckedChange={() => toggleOverride(line.key)}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{line.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Current: £{currentAmount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                      {isLineValue(current) && current.override_reason && (
                        <span className="ml-1">— {current.override_reason}</span>
                      )}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmImport}>
              Import ({IMPORTABLE_LINES.length - overriddenLines.length + selectedOverrides.size} lines)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
