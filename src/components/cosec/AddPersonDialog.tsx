import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export interface EditPscData {
  pscId: string;
  personId: string;
  title: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  nationality: string | null;
  countryOfResidence: string | null;
  serviceAddressLine1: string | null;
  serviceCity: string | null;
  servicePostcode: string | null;
  natureOfControl: string[];
  notifiedAt: string;
  ceasedAt: string | null;
}

interface AddPersonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  organizationId: string;
  type: "officer" | "psc";
  /** When set (type must be "psc"), the dialog edits this existing PSC instead of creating a new one. */
  editingPsc?: EditPscData | null;
}

const OFFICER_ROLES = [
  { value: "director", label: "Director" },
  { value: "secretary", label: "Secretary" },
  { value: "llp_member", label: "LLP Member" },
  { value: "llp_designated_member", label: "LLP Designated Member" },
];

const PSC_CONTROLS = [
  { value: "ownership-of-shares-25-to-50-percent", label: "Owns 25-50% of shares" },
  { value: "ownership-of-shares-50-to-75-percent", label: "Owns 50-75% of shares" },
  { value: "ownership-of-shares-75-to-100-percent", label: "Owns 75-100% of shares" },
  { value: "voting-rights-25-to-50-percent", label: "Has 25-50% voting rights" },
  { value: "voting-rights-50-to-75-percent", label: "Has 50-75% voting rights" },
  { value: "voting-rights-75-to-100-percent", label: "Has 75-100% voting rights" },
  { value: "right-to-appoint-and-remove-directors", label: "Right to appoint/remove directors" },
  { value: "significant-influence-or-control", label: "Significant influence or control" },
];

export function AddPersonDialog({ open, onOpenChange, companyId, organizationId, type, editingPsc }: AddPersonDialogProps) {
  const queryClient = useQueryClient();
  const isEditMode = type === "psc" && !!editingPsc;

  const buildDefaultFormData = () => ({
    title: editingPsc?.title || "",
    firstName: editingPsc?.firstName || "",
    lastName: editingPsc?.lastName || "",
    dateOfBirth: editingPsc?.dateOfBirth || "",
    nationality: editingPsc?.nationality ?? "British",
    countryOfResidence: editingPsc?.countryOfResidence ?? "United Kingdom",
    occupation: "",
    serviceAddressLine1: editingPsc?.serviceAddressLine1 || "",
    serviceCity: editingPsc?.serviceCity || "",
    servicePostcode: editingPsc?.servicePostcode || "",
    // Officer specific
    role: "director",
    appointedAt: new Date().toISOString().split("T")[0],
    // PSC specific
    natureOfControl: editingPsc?.natureOfControl ?? ([] as string[]),
    notifiedAt: editingPsc?.notifiedAt || new Date().toISOString().split("T")[0],
    ceasedAt: editingPsc?.ceasedAt || "",
  });

  const [formData, setFormData] = useState(buildDefaultFormData);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEditMode && editingPsc) {
        // Update the person's identity fields
        const { error: personError } = await supabase
          .from("company_persons")
          .update({
            title: formData.title || null,
            first_name: formData.firstName,
            last_name: formData.lastName,
            date_of_birth: formData.dateOfBirth || null,
            nationality: formData.nationality || null,
            country_of_residence: formData.countryOfResidence || null,
            service_address_line_1: formData.serviceAddressLine1 || null,
            service_city: formData.serviceCity || null,
            service_postcode: formData.servicePostcode || null,
          })
          .eq("id", editingPsc.personId)
          .eq("organization_id", organizationId);

        if (personError) throw personError;

        // Update the PSC record itself (ch_psc_id is intentionally left untouched)
        const { error: pscError } = await supabase
          .from("company_pscs")
          .update({
            nature_of_control: formData.natureOfControl,
            notified_at: formData.notifiedAt,
            ceased_at: formData.ceasedAt || null,
          })
          .eq("id", editingPsc.pscId)
          .eq("company_id", companyId);

        if (pscError) throw pscError;

        return null;
      }

      // First create the person
      const { data: person, error: personError } = await supabase
        .from("company_persons")
        .insert({
          organization_id: organizationId,
          title: formData.title || null,
          first_name: formData.firstName,
          last_name: formData.lastName,
          date_of_birth: formData.dateOfBirth || null,
          nationality: formData.nationality || null,
          country_of_residence: formData.countryOfResidence || null,
          occupation: formData.occupation || null,
          service_address_line_1: formData.serviceAddressLine1 || null,
          service_city: formData.serviceCity || null,
          service_postcode: formData.servicePostcode || null,
        })
        .select()
        .single();

      if (personError) throw personError;

      // Then create the officer or PSC
      if (type === "officer") {
        const { error: officerError } = await supabase
          .from("company_officers")
          .insert({
            company_id: companyId,
            person_id: person.id,
            role: formData.role,
            appointed_at: formData.appointedAt,
          });

        if (officerError) throw officerError;
      } else {
        const { error: pscError } = await supabase
          .from("company_pscs")
          .insert({
            company_id: companyId,
            person_id: person.id,
            nature_of_control: formData.natureOfControl,
            notified_at: formData.notifiedAt,
          });

        if (pscError) throw pscError;
      }

      return person;
    },
    onSuccess: () => {
      if (isEditMode) {
        toast.success("PSC updated");
      } else {
        toast.success(type === "officer" ? "Officer added" : "PSC added");
        queryClient.invalidateQueries({ queryKey: ["company-officers", companyId] });
      }
      queryClient.invalidateQueries({ queryKey: ["company-pscs", companyId] });
      queryClient.invalidateQueries({ queryKey: ["register-events", companyId] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(isEditMode ? "Failed to update PSC" : "Failed to add person", { description: error.message });
    },
  });

  const resetForm = () => {
    setFormData(buildDefaultFormData());
  };

  const toggleControl = (value: string) => {
    setFormData(prev => ({
      ...prev,
      natureOfControl: prev.natureOfControl.includes(value)
        ? prev.natureOfControl.filter(c => c !== value)
        : [...prev.natureOfControl, value],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit PSC" : `Add ${type === "officer" ? "Officer" : "PSC"}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Select
                value={formData.title}
                onValueChange={(v) => setFormData(prev => ({ ...prev, title: v }))}
              >
                <SelectTrigger id="title">
                  <SelectValue placeholder="Title" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mr">Mr</SelectItem>
                  <SelectItem value="Mrs">Mrs</SelectItem>
                  <SelectItem value="Ms">Ms</SelectItem>
                  <SelectItem value="Miss">Miss</SelectItem>
                  <SelectItem value="Dr">Dr</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              value={formData.lastName}
              onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="nationality">Nationality</Label>
              <Input
                id="nationality"
                value={formData.nationality}
                onChange={(e) => setFormData(prev => ({ ...prev, nationality: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="countryOfResidence">Country of Residence</Label>
            <Input
              id="countryOfResidence"
              value={formData.countryOfResidence}
              onChange={(e) => setFormData(prev => ({ ...prev, countryOfResidence: e.target.value }))}
            />
          </div>

          {type === "officer" && (
            <>
              <div>
                <Label htmlFor="occupation">Occupation</Label>
                <Input
                  id="occupation"
                  value={formData.occupation}
                  onChange={(e) => setFormData(prev => ({ ...prev, occupation: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="role">Role *</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, role: v }))}
                  >
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OFFICER_ROLES.map(role => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="appointedAt">Appointed Date *</Label>
                  <Input
                    id="appointedAt"
                    type="date"
                    value={formData.appointedAt}
                    onChange={(e) => setFormData(prev => ({ ...prev, appointedAt: e.target.value }))}
                    required
                  />
                </div>
              </div>
            </>
          )}

          {type === "psc" && (
            <>
              <div>
                <Label htmlFor="notifiedAt">Notified Date *</Label>
                <Input
                  id="notifiedAt"
                  type="date"
                  value={formData.notifiedAt}
                  onChange={(e) => setFormData(prev => ({ ...prev, notifiedAt: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label className="mb-2 block">Nature of Control *</Label>
                <div className="space-y-2 border rounded-md p-3">
                  {PSC_CONTROLS.map(control => (
                    <div key={control.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={control.value}
                        checked={formData.natureOfControl.includes(control.value)}
                        onCheckedChange={() => toggleControl(control.value)}
                      />
                      <label
                        htmlFor={control.value}
                        className="text-sm cursor-pointer"
                      >
                        {control.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {isEditMode && (
                <div>
                  <Label htmlFor="ceasedAt">Ceased Date</Label>
                  <Input
                    id="ceasedAt"
                    type="date"
                    value={formData.ceasedAt}
                    onChange={(e) => setFormData(prev => ({ ...prev, ceasedAt: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Set this to record the PSC as ceased. Leave blank to keep them active.
                  </p>
                </div>
              )}
            </>
          )}

          <div className="border-t pt-4 mt-4">
            <h4 className="text-sm font-medium mb-3">Service Address</h4>
            <div className="space-y-3">
              <div>
                <Label htmlFor="serviceAddressLine1">Address Line 1</Label>
                <Input
                  id="serviceAddressLine1"
                  value={formData.serviceAddressLine1}
                  onChange={(e) => setFormData(prev => ({ ...prev, serviceAddressLine1: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="serviceCity">City</Label>
                  <Input
                    id="serviceCity"
                    value={formData.serviceCity}
                    onChange={(e) => setFormData(prev => ({ ...prev, serviceCity: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="servicePostcode">Postcode</Label>
                  <Input
                    id="servicePostcode"
                    value={formData.servicePostcode}
                    onChange={(e) => setFormData(prev => ({ ...prev, servicePostcode: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !formData.firstName || !formData.lastName || (type === "psc" && formData.natureOfControl.length === 0)}
          >
            {isEditMode
              ? (mutation.isPending ? "Saving..." : "Save Changes")
              : (mutation.isPending ? "Adding..." : `Add ${type === "officer" ? "Officer" : "PSC"}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
