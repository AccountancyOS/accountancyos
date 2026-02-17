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
import { Send, Loader2, Lock, FileCheck } from "lucide-react";
import { sendFilingToClient } from "@/lib/filing-lock-service";
import { useToast } from "@/hooks/use-toast";

interface SendToClientDialogProps {
  filingId: string;
  entityName: string;
  onSent: () => void;
  trigger?: React.ReactNode;
}

export function SendToClientDialog({ filingId, entityName, onSent, trigger }: SendToClientDialogProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    setIsSending(true);
    const result = await sendFilingToClient(filingId, message.trim() || undefined);
    setIsSending(false);

    if (result.success) {
      toast({
        title: "Filing sent to client",
        description: `Version ${result.version} locked and sent to ${entityName}`,
      });
      setMessage("");
      setOpen(false);
      onSent();
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {trigger || (
          <Button>
            <Send className="h-4 w-4 mr-2" />
            Send to Client
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send Filing to Client</AlertDialogTitle>
          <AlertDialogDescription>
            This will lock the filing and create an immutable snapshot including the current 
            trial balance and chart of accounts state. The client will be able to review and approve.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4 space-y-4">
          <div className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <span>Filing & workpapers will be locked</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <FileCheck className="h-4 w-4 text-muted-foreground" />
              <span>TB & COA snapshots captured</span>
            </div>
          </div>
          <div>
            <Label htmlFor="client-message">Message to client (optional)</Label>
            <Textarea
              id="client-message"
              placeholder="Any notes for the client about this filing..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="mt-2 resize-none"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleSend();
            }}
            disabled={isSending}
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Lock & Send
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
