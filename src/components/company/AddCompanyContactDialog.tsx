import { useState } from "react";
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
import type { TablesInsert } from "@/integrations/supabase/types";

interface AddCompanyContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  organizationId: string;
}

/**
 * `contacts.person_id` was added in 20260720190000_company_profile_person_fields.sql
 * and isn't in the generated Insert type yet; extend it locally rather than
 * casting the whole insert payload to `any`.
 */
type ContactInsertWithPerson = TablesInsert<"contacts"> & { person_id: string };

const emptyForm = { firstName: "", lastName: "", email: "", phone: "", role: "" };

/**
 * "Add contact" — creates a non-officer company_persons + contacts row for
 * this company (e.g. a bookkeeper or FD who isn't a director). Mirrors the
 * cosec AddPersonDialog's person-creation pattern but simplified to the
 * `contacts` table's own required fields (name, email).
 */
export function AddCompanyContactDialog({
  open,
  onOpenChange,
  companyId,
  organizationId,
}: AddCompanyContactDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);

  const resetForm = () => setForm(emptyForm);

  const mutation = useMutation({
    mutationFn: async () => {
      const firstName = form.firstName.trim();
      const lastName = form.lastName.trim();
      const email = form.email.trim();

      const { data: person, error: personError } = await supabase
        .from("company_persons")
        .insert({
          organization_id: organizationId,
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          phone: form.phone.trim() || null,
        })
        .select()
        .single();
      if (personError) throw personError;

      const contactInsert: ContactInsertWithPerson = {
        organization_id: organizationId,
        company_id: companyId,
        person_id: person.id,
        name: `${firstName} ${lastName}`.trim(),
        email,
        phone: form.phone.trim() || null,
        role: form.role.trim() || null,
      };
      const { error: contactError } = await supabase.from("contacts").insert(contactInsert);
      if (contactError) throw contactError;

      return person;
    },
    onSuccess: () => {
      toast.success("Contact added");
      queryClient.invalidateQueries({ queryKey: ["company-contacts-panel", companyId] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error("Failed to add contact", { description: error.message });
    },
  });

  const canSubmit =
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
          <DialogDescription>
            Add a non-officer contact for this company, such as a bookkeeper or finance director.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact-first-name">First Name *</Label>
              <Input
                id="contact-first-name"
                value={form.firstName}
                onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-last-name">Last Name *</Label>
              <Input
                id="contact-last-name"
                value={form.lastName}
                onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-email">Email *</Label>
            <Input
              id="contact-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="contact@example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-role">Role</Label>
              <Input
                id="contact-role"
                value={form.role}
                onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                placeholder="e.g. Bookkeeper"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
