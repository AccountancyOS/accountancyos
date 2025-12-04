import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntitySelector, BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { toast } from "sonner";

interface AddPayeSchemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  preSelectedEntity?: BookkeepingEntity | null;
}

export function AddPayeSchemeDialog({ open, onOpenChange, onSuccess, preSelectedEntity }: AddPayeSchemeDialogProps) {
  const { organization } = useOrganization();
  const [entity, setEntity] = useState<BookkeepingEntity | null>(preSelectedEntity || null);
  const [name, setName] = useState("");
  const [payeRef, setPayeRef] = useState("");
  const [aoRef, setAoRef] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !entity) throw new Error("Missing required fields");
      const { error } = await supabase.from("paye_schemes").insert({
        organization_id: organization.id,
        company_id: entity.type === "company" ? entity.id : null,
        client_id: entity.type === "client" ? entity.id : null,
        name: name || null,
        employer_paye_reference: payeRef,
        accounts_office_reference: aoRef || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("PAYE scheme created");
      setName("");
      setPayeRef("");
      setAoRef("");
      onSuccess();
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add PAYE Scheme</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Employer</Label>
            <EntitySelector value={entity} onValueChange={setEntity} />
          </div>
          <div>
            <Label>Scheme Name (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Payroll" />
          </div>
          <div>
            <Label>PAYE Reference</Label>
            <Input value={payeRef} onChange={(e) => setPayeRef(e.target.value)} placeholder="123/AB12345" />
          </div>
          <div>
            <Label>Accounts Office Reference</Label>
            <Input value={aoRef} onChange={(e) => setAoRef(e.target.value)} placeholder="123PA00012345" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!entity || !payeRef || createMutation.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}