import { useState } from "react";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus } from "lucide-react";
import { FormFieldError } from "@/components/ui/form-field-error";
import { 
  individualClientSchema, 
  companyClientSchema, 
  validateForm,
  type IndividualClientForm,
  type CompanyClientForm 
} from "@/lib/validation-schemas";

export function AddClientDialog() {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientType, setClientType] = useState<"individual" | "company">("individual");
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [individualForm, setIndividualForm] = useState<IndividualClientForm>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });
  
  const [companyForm, setCompanyForm] = useState<CompanyClientForm>({
    company_name: "",
    email: "",
    phone: "",
    company_number: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;
    
    setErrors({});
    
    // Validate based on client type
    if (clientType === "individual") {
      const validation = validateForm(individualClientSchema, individualForm);
      if (!validation.success) {
        setErrors(validation.errors || {});
        toast({
          title: "Validation Error",
          description: "Please check the form for errors",
          variant: "destructive",
        });
        return;
      }
    } else {
      const validation = validateForm(companyClientSchema, companyForm);
      if (!validation.success) {
        setErrors(validation.errors || {});
        toast({
          title: "Validation Error",
          description: "Please check the form for errors",
          variant: "destructive",
        });
        return;
      }
    }
    
    setLoading(true);
    try {
      if (clientType === "individual") {
        const { error } = await supabase
          .from("clients")
          .insert({
            organization_id: organization.id,
            first_name: individualForm.first_name.trim(),
            last_name: individualForm.last_name.trim(),
            email: individualForm.email.trim().toLowerCase(),
            phone: individualForm.phone?.trim() || null,
          });
        
        if (error) throw error;
        
        toast({ title: "Client added successfully" });
      } else {
        const { error } = await supabase
          .from("companies")
          .insert({
            organization_id: organization.id,
            company_name: companyForm.company_name.trim(),
            email: companyForm.email.trim().toLowerCase(),
            phone: companyForm.phone?.trim() || null,
            company_number: companyForm.company_number?.trim().toUpperCase() || null,
          });
        
        if (error) throw error;
        
        toast({ title: "Company added successfully" });
      }
      
      queryClient.invalidateQueries({ queryKey: ["clients", organization.id] });
      queryClient.invalidateQueries({ queryKey: ["companies", organization.id] });
      setOpen(false);
      
      // Reset forms
      setIndividualForm({ first_name: "", last_name: "", email: "", phone: "" });
      setCompanyForm({ company_name: "", email: "", phone: "", company_number: "" });
      setErrors({});
    } catch (error: any) {
      toast({
        title: "Error adding client",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setErrors({});
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Client
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
          <DialogDescription>
            Add a new individual client or company to your practice.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <Label>Client Type</Label>
            <RadioGroup value={clientType} onValueChange={(v) => {
              setClientType(v as any);
              setErrors({});
            }}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="individual" id="individual" />
                <Label htmlFor="individual" className="font-normal cursor-pointer">
                  Individual
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="company" id="company" />
                <Label htmlFor="company" className="font-normal cursor-pointer">
                  Company
                </Label>
              </div>
            </RadioGroup>
          </div>

          {clientType === "individual" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input
                    id="first_name"
                    value={individualForm.first_name}
                    onChange={(e) =>
                      setIndividualForm({ ...individualForm, first_name: e.target.value })
                    }
                    className={errors.first_name ? "border-destructive" : ""}
                    maxLength={100}
                  />
                  <FormFieldError error={errors.first_name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name *</Label>
                  <Input
                    id="last_name"
                    value={individualForm.last_name}
                    onChange={(e) =>
                      setIndividualForm({ ...individualForm, last_name: e.target.value })
                    }
                    className={errors.last_name ? "border-destructive" : ""}
                    maxLength={100}
                  />
                  <FormFieldError error={errors.last_name} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={individualForm.email}
                  onChange={(e) =>
                    setIndividualForm({ ...individualForm, email: e.target.value })
                  }
                  className={errors.email ? "border-destructive" : ""}
                  maxLength={255}
                />
                <FormFieldError error={errors.email} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={individualForm.phone}
                  onChange={(e) =>
                    setIndividualForm({ ...individualForm, phone: e.target.value })
                  }
                  className={errors.phone ? "border-destructive" : ""}
                  maxLength={20}
                />
                <FormFieldError error={errors.phone} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name *</Label>
                <Input
                  id="company_name"
                  value={companyForm.company_name}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, company_name: e.target.value })
                  }
                  className={errors.company_name ? "border-destructive" : ""}
                  maxLength={200}
                />
                <FormFieldError error={errors.company_name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_email">Email *</Label>
                <Input
                  id="company_email"
                  type="email"
                  value={companyForm.email}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, email: e.target.value })
                  }
                  className={errors.email ? "border-destructive" : ""}
                  maxLength={255}
                />
                <FormFieldError error={errors.email} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_phone">Phone</Label>
                <Input
                  id="company_phone"
                  type="tel"
                  value={companyForm.phone}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, phone: e.target.value })
                  }
                  className={errors.phone ? "border-destructive" : ""}
                  maxLength={20}
                />
                <FormFieldError error={errors.phone} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_number">Company Number</Label>
                <Input
                  id="company_number"
                  value={companyForm.company_number}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, company_number: e.target.value })
                  }
                  placeholder="e.g., 12345678"
                  className={errors.company_number ? "border-destructive" : ""}
                  maxLength={20}
                />
                <FormFieldError error={errors.company_number} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
