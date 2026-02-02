import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { FileText, CheckCircle, AlertTriangle, PenLine } from "lucide-react";

interface DocumentSignatureFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    file_name: string;
    file_path: string;
    signature_required: boolean;
    signed_at: string | null;
  };
}

export function DocumentSignatureFlow({
  open,
  onOpenChange,
  document,
}: DocumentSignatureFlowProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [isAgreed, setIsAgreed] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setScrollProgress(0);
      setHasScrolledToEnd(false);
      setTypedName("");
      setIsAgreed(false);
    }
  }, [open]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const maxScroll = scrollHeight - clientHeight;
    
    if (maxScroll <= 0) {
      // Document fits entirely - no scroll needed
      setScrollProgress(100);
      setHasScrolledToEnd(true);
      return;
    }
    
    const progress = Math.round((scrollTop / maxScroll) * 100);
    setScrollProgress(progress);
    
    // Consider scrolled to end if at least 95% scrolled
    if (progress >= 95) {
      setHasScrolledToEnd(true);
    }
  }, []);

  const signMutation = useMutation({
    mutationFn: async () => {
      // Get client IP (best effort)
      let clientIp = "unknown";
      try {
        const res = await fetch("https://api.ipify.org?format=json");
        const data = await res.json();
        clientIp = data.ip;
      } catch {
        // Ignore IP fetch failures
      }

      const { error } = await supabase
        .from("job_documents")
        .update({
          signed_at: new Date().toISOString(),
          signed_by: (await supabase.auth.getUser()).data.user?.id,
          signature_typed_name: typedName,
          signature_ip: clientIp,
          scroll_verified: true,
        })
        .eq("id", document.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-documents"] });
      toast({ title: "Document signed successfully" });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({ 
        title: "Signature failed", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const canSign = hasScrolledToEnd && typedName.trim().length >= 2 && isAgreed;

  const handleSign = () => {
    if (!canSign) return;
    signMutation.mutate();
  };

  if (document.signed_at) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Document Already Signed
            </DialogTitle>
            <DialogDescription>
              This document was signed on {new Date(document.signed_at).toLocaleDateString()}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Sign Document: {document.file_name}
          </DialogTitle>
          <DialogDescription>
            Please read through the entire document, then sign below.
          </DialogDescription>
        </DialogHeader>

        {/* Document Preview Area */}
        <div className="flex-1 min-h-0">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Reading progress</span>
            <span className={hasScrolledToEnd ? "text-green-600" : "text-muted-foreground"}>
              {scrollProgress}%
            </span>
          </div>
          <Progress value={scrollProgress} className="mb-4" />
          
          <ScrollArea 
            className="h-64 border rounded-md bg-muted/30"
            onScrollCapture={handleScroll}
            ref={scrollRef as any}
          >
            <div className="p-4 space-y-4">
              {/* Document content would be loaded here */}
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Document preview loading...</p>
                <p className="text-xs mt-2">
                  File: {document.file_path}
                </p>
              </div>
              
              {/* Simulated long content for scroll testing */}
              <div className="prose prose-sm dark:prose-invert">
                <p className="text-muted-foreground">
                  By signing this document, you acknowledge that you have read and understood 
                  its contents. This constitutes a legally binding agreement between the parties 
                  named herein.
                </p>
                <div className="h-48" />
                <p className="text-muted-foreground">
                  End of document. Please scroll to the bottom to enable signing.
                </p>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Signature Section */}
        <div className="space-y-4 pt-4 border-t">
          {!hasScrolledToEnd && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Please scroll through the entire document before signing.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="typedName">Type your full name to sign</Label>
            <Input
              id="typedName"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Your full legal name"
              disabled={!hasScrolledToEnd}
            />
          </div>

          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="agreeToSign"
              checked={isAgreed}
              onChange={(e) => setIsAgreed(e.target.checked)}
              disabled={!hasScrolledToEnd}
              className="mt-1"
            />
            <Label htmlFor="agreeToSign" className="text-sm font-normal">
              I confirm that I have read and understand this document, and I agree to 
              sign it electronically. This signature is legally binding.
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSign} 
            disabled={!canSign || signMutation.isPending}
            className="gap-2"
          >
            <PenLine className="h-4 w-4" />
            {signMutation.isPending ? "Signing..." : "Sign Document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
