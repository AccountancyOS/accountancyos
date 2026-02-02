import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

interface Contact {
  id: string;
  name: string;
  role: string | null;
  email: string;
  phone: string | null;
  is_primary: boolean;
  client_id: string | null;
  company_id: string | null;
}

interface AddContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  companyId?: string;
  editingContact?: Contact | null;
}

// Simplified contact roles per Phase 5.2
const ROLE_OPTIONS = [
  { value: "Director", label: "Director" },
  { value: "Bookkeeper", label: "Bookkeeper" },
  { value: "Other", label: "Other" },
];

export function AddContactDialog({
  open,
  onOpenChange,
  clientId,
  companyId,
  editingContact,
}: AddContactDialogProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  // Reset form when dialog opens/closes or editing contact changes
  useEffect(() => {
    if (editingContact) {
      setName(editingContact.name);
      setRole(editingContact.role || "");
      setEmail(editingContact.email);
      setPhone(editingContact.phone || "");
      setIsPrimary(editingContact.is_primary);
    } else {
      setName("");
      setRole("");
      setEmail("");
      setPhone("");
      setIsPrimary(false);
    }
  }, [editingContact, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");
      if (!clientId && !companyId) throw new Error("Must specify client or company");

      const contactData = {
        organization_id: organization.id,
        client_id: clientId || null,
        company_id: companyId || null,
        name,
        role: role || null,
        email,
        phone: phone || null,
        is_primary: isPrimary,
      };

      if (editingContact) {
        const { error } = await supabase
          .from("contacts")
          .update(contactData)
          .eq("id", editingContact.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("contacts")
          .insert(contactData);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      onOpenChange(false);
      toast({ title: editingContact ? "Contact updated" : "Contact added" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!email.trim()) {
      toast({ title: "Email is required", variant: "destructive" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Invalid email format", variant: "destructive" });
      return;
    }

    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{editingContact ? "Edit Contact" : "Add Contact"}</DialogTitle>
          <DialogDescription>
            {editingContact 
              ? "Update the contact details below."
              : "Add a new contact with their email address for email matching."
            }
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 7700 900000"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isPrimary"
                checked={isPrimary}
                onCheckedChange={(checked) => setIsPrimary(checked === true)}
              />
              <Label htmlFor="isPrimary" className="text-sm font-normal">
                Mark as primary contact
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending 
                ? "Saving..." 
                : editingContact 
                  ? "Update Contact" 
                  : "Add Contact"
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
