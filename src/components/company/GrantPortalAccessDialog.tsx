import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface GrantPortalAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  personId: string;
  personName: string;
  defaultEmail?: string | null;
}

/** jsonb shape returned by grant_person_portal_access. */
type GrantPortalAccessResult = { ok: boolean; person_id: string; granted: number; skipped: number };

/**
 * "Give portal access" action: grants portal access across every entity the
 * person is linked to (their linked SA client, and every company where they
 * are an active officer) via grant_person_portal_access, which reuses
 * lifecycle_grant_portal_access per entity and dedupes already-active grants.
 */
export function GrantPortalAccessDialog({
  open,
  onOpenChange,
  companyId,
  personId,
  personName,
  defaultEmail,
}: GrantPortalAccessDialogProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(defaultEmail || "");

  useEffect(() => {
    if (open) setEmail(defaultEmail || "");
  }, [open, defaultEmail]);

  const grantMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("grant_person_portal_access" as any, {
        p_person_id: personId,
        p_user_email: email.trim(),
      });
      if (error) throw error;
      return data as unknown as GrantPortalAccessResult;
    },
    onSuccess: (data) => {
      toast.success("Portal access processed", {
        description: `Granted ${data.granted} new ${data.granted === 1 ? "invite" : "invites"}${
          data.skipped > 0 ? `, ${data.skipped} already had active access` : ""
        }.`,
      });
      queryClient.invalidateQueries({ queryKey: ["company-contacts-panel", companyId] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error("Failed to grant portal access", { description: error.message });
    },
  });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Give {personName} portal access</DialogTitle>
          <DialogDescription>
            Grants access across every entity this person is linked to — this company (if they're an active
            officer) and their linked SA client, if any.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="portal-access-email">Email address</Label>
          <Input
            id="portal-access-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={grantMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => grantMutation.mutate()} disabled={!emailValid || grantMutation.isPending}>
            {grantMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Grant Access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
