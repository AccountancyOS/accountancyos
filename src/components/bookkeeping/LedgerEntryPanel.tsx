import { formatCurrency } from "@/lib/bookkeeping-utils";
import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface LedgerEntryPanelProps {
  entry: any;
  onClose: () => void;
}

export function LedgerEntryPanel({ entry, onClose }: LedgerEntryPanelProps) {
  if (!entry) return null;

  return (
    <Sheet open={!!entry} onOpenChange={onClose}>
      <SheetContent className="w-[500px]">
        <SheetHeader>
          <SheetTitle>Ledger Entry Details</SheetTitle>
          <SheetDescription>
            {format(new Date(entry.transaction_date), "dd MMMM yyyy")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div>
            <div className="text-sm text-muted-foreground mb-2">Account</div>
            <div className="font-medium">
              <div className="font-mono">{entry.account.code}</div>
              <div className="text-sm text-muted-foreground">
                {entry.account.name}
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-2">Debit</div>
              <div className="font-mono text-lg font-medium">
                {entry.debit ? formatCurrency(entry.debit) : "—"}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-2">Credit</div>
              <div className="font-mono text-lg font-medium">
                {entry.credit ? formatCurrency(entry.credit) : "—"}
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <div className="text-sm text-muted-foreground mb-2">Description</div>
            <div>{entry.description || "No description"}</div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground mb-2">Source</div>
            <div>
              <Badge variant="outline">{entry.source_type}</Badge>
            </div>
          </div>

          {entry.vat_code_id && (
            <div>
              <div className="text-sm text-muted-foreground mb-2">VAT Code</div>
              <div>{entry.vat_code_id}</div>
            </div>
          )}

          {entry.document_id && (
            <div>
              <div className="text-sm text-muted-foreground mb-2">
                Attached Document
              </div>
              <div className="text-sm text-blue-600">
                View document →
              </div>
            </div>
          )}

          <Separator />

          <div className="text-xs text-muted-foreground space-y-1">
            <div>Created: {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm")}</div>
            {entry.updated_at !== entry.created_at && (
              <div>Updated: {format(new Date(entry.updated_at), "dd/MM/yyyy HH:mm")}</div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
