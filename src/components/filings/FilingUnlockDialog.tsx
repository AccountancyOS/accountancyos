import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Unlock, Loader2 } from "lucide-react";
import { unlockFiling } from "@/lib/filing-lock-service";
import { useToast } from "@/hooks/use-toast";

interface FilingUnlockDialogProps {
  filingId: string;
  onUnlocked: () => void;
  trigger?: React.ReactNode;
}

export function FilingUnlockDialog({ filingId, onUnlocked, trigger }: FilingUnlockDialogProps) {
  const [reason, setReason] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleUnlock = async () => {
    if (reason.trim().length < 10) {
      toast({ title: "Reason too short", description: "Please provide at least 10 characters.", variant: "destructive" });
      return;
    }

    setIsUnlocking(true);
    const result = await unlockFiling({ filingId, reason: reason.trim() });
    setIsUnlocking(false);

    if (result.success) {
      toast({ title: "Filing unlocked" });
      setReason("");
      setOpen(false);
      onUnlocked();
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Unlock className="h-4 w-4 mr-2" />
            Unlock Filing
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Unlock Filing
          </AlertDialogTitle>
          <AlertDialogDescription>
            Unlocking a filed or locked filing will allow edits to schedule data. 
            This action is audit-logged and requires a detailed reason.
            Any linked workpapers will also be unlocked.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4 space-y-3">
          <Label htmlFor="unlock-reason">Reason for unlocking (required)</Label>
          <Textarea
            id="unlock-reason"
            placeholder="e.g., Client reported incorrect property income figure, needs amendment before resubmission..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Minimum 10 characters. This will be recorded in the audit trail.
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isUnlocking}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleUnlock();
            }}
            disabled={isUnlocking || reason.trim().length < 10}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isUnlocking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Unlock Filing
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
