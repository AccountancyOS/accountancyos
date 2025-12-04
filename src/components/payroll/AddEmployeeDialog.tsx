import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface AddEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  preSelectedSchemeId?: string | null;
}

export function AddEmployeeDialog({ open, onOpenChange, onSuccess, preSelectedSchemeId }: AddEmployeeDialogProps) {
  const { organization } = useOrganization();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [schemeId, setSchemeId] = useState(preSelectedSchemeId || "");
  const [taxCode, setTaxCode] = useState("1257L");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: schemes } = useQuery({
    queryKey: ["paye-schemes-list", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data } = await supabase
        .from("paye_schemes")
        .select("id, employer_paye_reference, name, companies(company_name)")
        .eq("organization_id", organization.id);
      return data || [];
    },
    enabled: open && !!organization?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !schemeId) throw new Error("Missing required fields");
      
      const { error } = await supabase.from("employees").insert({
        organization_id: organization.id,
        paye_scheme_id: schemeId,
        first_name: firstName,
        last_name: lastName,
        tax_code: taxCode,
        date_of_birth: dateOfBirth,
        start_date: startDate,
        status: "active",
        nic_category: "A",
        pay_frequency: "monthly",
        tax_basis: "cumulative",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Employee added");
      setFirstName("");
      setLastName("");
      setDateOfBirth("");
      onSuccess();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Employee</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>PAYE Scheme</Label>
            <Select value={schemeId} onValueChange={setSchemeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select scheme" />
              </SelectTrigger>
              <SelectContent>
                {schemes?.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.employer_paye_reference} - {s.companies?.company_name || s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>First Name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date of Birth</Label>
              <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Tax Code</Label>
            <Input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={() => createMutation.mutate()} 
            disabled={!firstName || !lastName || !schemeId || !dateOfBirth || createMutation.isPending}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
