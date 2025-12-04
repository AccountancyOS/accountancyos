import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { format, addMonths, startOfMonth } from "date-fns";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ReverseJournalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journal: {
    id: string;
    reference: string;
    journal_date: string;
    description: string;
    total_debit: number;
    total_credit: number;
    client_id?: string;
    company_id?: string;
  } | null;
}

export function ReverseJournalDialog({
  open,
  onOpenChange,
  journal,
}: ReverseJournalDialogProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  
  // Calculate smart default: first day of next month
  const getDefaultReversalDate = () => {
    if (!journal) return format(new Date(), "yyyy-MM-dd");
    const journalDate = new Date(journal.journal_date);
    const nextMonth = startOfMonth(addMonths(journalDate, 1));
    return format(nextMonth, "yyyy-MM-dd");
  };

  const [reversalDate, setReversalDate] = useState(getDefaultReversalDate());
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (journal) {
      setReversalDate(getDefaultReversalDate());
      setReason(`Reversal of ${journal.reference}`);
    }
  }, [journal]);

  // Check if reversal date is in a locked period
  const { data: periodLock } = useQuery({
    queryKey: ["period-lock-check", organization?.id, journal?.client_id, journal?.company_id, reversalDate],
    queryFn: async () => {
      if (!organization?.id || !journal) return null;
      
      const { data } = await supabase
        .from("period_locks")
        .select("lock_date")
        .eq("organization_id", organization.id)
        .or(
          journal.client_id 
            ? `client_id.eq.${journal.client_id}` 
            : `company_id.eq.${journal.company_id}`
        )
        .order("lock_date", { ascending: false })
        .limit(1)
        .single();
      
      return data;
    },
    enabled: !!organization?.id && !!journal && open,
  });

  const isDateLocked = periodLock?.lock_date && new Date(reversalDate) <= new Date(periodLock.lock_date);

  const reverseMutation = useMutation({
    mutationFn: async () => {
      if (!journal) throw new Error("No journal selected");
      
      const { data, error } = await supabase.rpc("reverse_journal", {
        p_journal_id: journal.id,
        p_reversal_date: reversalDate,
        p_reason: reason || null,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; reversal_journal_id?: string };
      if (!result.success) {
        throw new Error(result.error || "Failed to reverse journal");
      }
      
      return result;
    },
    onSuccess: (data) => {
      toast({
        title: "Journal Reversed",
        description: `Reversal journal created with ID ${data.reversal_journal_id?.slice(0, 8)}...`,
      });
      queryClient.invalidateQueries({ queryKey: ["journals"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Reversal Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!journal) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Reverse Journal
          </DialogTitle>
          <DialogDescription>
            Create a reversal entry for journal <strong>{journal.reference}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Original Journal Summary */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <div className="text-sm font-medium">Original Journal</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Date:</span>{" "}
                {format(new Date(journal.journal_date), "dd MMM yyyy")}
              </div>
              <div>
                <span className="text-muted-foreground">Reference:</span>{" "}
                {journal.reference}
              </div>
              <div>
                <span className="text-muted-foreground">Debit:</span>{" "}
                £{journal.total_debit?.toFixed(2)}
              </div>
              <div>
                <span className="text-muted-foreground">Credit:</span>{" "}
                £{journal.total_credit?.toFixed(2)}
              </div>
            </div>
            {journal.description && (
              <div className="text-sm">
                <span className="text-muted-foreground">Description:</span>{" "}
                {journal.description}
              </div>
            )}
          </div>

          {/* Reversal Date */}
          <div className="space-y-2">
            <Label htmlFor="reversalDate">Reversal Date</Label>
            <Input
              id="reversalDate"
              type="date"
              value={reversalDate}
              onChange={(e) => setReversalDate(e.target.value)}
              min={journal.journal_date}
            />
            <p className="text-xs text-muted-foreground">
              Defaults to the first day of the next period. Must be after the original journal date.
            </p>
          </div>

          {/* Period Lock Warning */}
          {isDateLocked && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                The selected date ({format(new Date(reversalDate), "dd MMM yyyy")}) is in a locked period. 
                Please select a date after {format(new Date(periodLock.lock_date), "dd MMM yyyy")}.
              </AlertDescription>
            </Alert>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for reversal..."
              rows={2}
            />
          </div>

          {/* What Will Happen */}
          <div className="rounded-lg border p-3 space-y-1">
            <div className="text-sm font-medium">What will happen:</div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>A new journal with reversed debits/credits will be created</li>
              <li>The original journal will be marked as "Reversed"</li>
              <li>Both journals will be linked for audit trail</li>
              <li>Ledger entries will be updated accordingly</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => reverseMutation.mutate()}
            disabled={reverseMutation.isPending || isDateLocked}
          >
            {reverseMutation.isPending ? "Reversing..." : "Confirm Reversal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
