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
import { Plus, Search } from "lucide-react";
import { FormFieldError } from "@/components/ui/form-field-error";
import { ClientTypeSelector } from "./ClientTypeSelector";
import { ClientDetailFields } from "./ClientDetailFields";
import {
  type ClientType,
  isCompanyBasedType,
  getClientTypeConfig,
} from "@/lib/client-types";

interface CoreFormData {
  // Individual fields
  first_name: string;
  last_name: string;
  preferred_name: string;
  // Company fields
  company_name: string;
  // Shared fields
  email: string;
  phone: string;
  mobile_number: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  postcode: string;
}

export function AddClientDialog() {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientType, setClientType] = useState<ClientType>("other");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [coreForm, setCoreForm] = useState<CoreFormData>({
    first_name: "",
    last_name: "",
    preferred_name: "",
    company_name: "",
    email: "",
    phone: "",
    mobile_number: "",
    address_line_1: "",
    address_line_2: "",
    city: "",
    postcode: "",
  });

  const [detailValues, setDetailValues] = useState<Record<string, any>>({});

  const handleDetailChange = (field: string, value: any) => {
    setDetailValues((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setCoreForm({
      first_name: "",
      last_name: "",
      preferred_name: "",
      company_name: "",
      email: "",
      phone: "",
      mobile_number: "",
      address_line_1: "",
      address_line_2: "",
      city: "",
      postcode: "",
    });
    setDetailValues({});
    setErrors({});
    setClientType("other");
  };

  const validateCoreForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (isCompanyBasedType(clientType)) {
      if (!coreForm.company_name.trim()) {
        newErrors.company_name = "Company name is required";
      }
    } else {
      if (!coreForm.first_name.trim()) {
        newErrors.first_name = "First name is required";
      }
      if (!coreForm.last_name.trim()) {
        newErrors.last_name = "Last name is required";
      }
    }

    if (!coreForm.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(coreForm.email)) {
      newErrors.email = "Invalid email format";
    }

    // Validate UK-specific fields if present
    if (detailValues.utr && !/^\d{10}$/.test(detailValues.utr)) {
      newErrors.utr = "UTR must be exactly 10 digits";
    }

    if (detailValues.nino && !/^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/i.test(detailValues.nino)) {
      newErrors.nino = "Invalid National Insurance number format";
    }

    if (detailValues.company_number && !/^[A-Z0-9]{6,8}$/i.test(detailValues.company_number)) {
      newErrors.company_number = "Invalid company number format";
    }

    if (detailValues.vat_number && !/^GB\d{9}(\d{3})?$/i.test(detailValues.vat_number)) {
      newErrors.vat_number = "Invalid VAT number format (GB followed by 9 or 12 digits)";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;

    if (!validateCoreForm()) {
      toast({
        title: "Validation Error",
        description: "Please check the form for errors.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const config = getClientTypeConfig(clientType);

      if (isCompanyBasedType(clientType)) {
        // Insert into companies table
        const { data: company, error: companyError } = await supabase
          .from("companies")
          .insert({
            organization_id: organization.id,
            company_name: coreForm.company_name.trim(),
            email: coreForm.email.trim().toLowerCase(),
            phone: coreForm.phone.trim() || null,
            company_number: detailValues.company_number?.trim().toUpperCase() || null,
            vat_number: detailValues.vat_number?.trim().toUpperCase() || null,
            auth_code: detailValues.auth_code?.trim() || null,
          })
          .select()
          .single();

        if (companyError) throw companyError;

        // Insert charity details if charity type
        if (clientType === 'charity' && company) {
          const { error: charityError } = await supabase
            .from("client_detail_charity")
            .insert({
              client_id: company.id,
              organization_id: organization.id,
              charity_number: detailValues.charity_number?.trim() || null,
              trading_as: detailValues.trading_as?.trim() || null,
              charity_year_end: detailValues.charity_year_end || null,
              gift_aid_claim_expiry: detailValues.gift_aid_claim_expiry || null,
            });

          if (charityError) {
            console.error("Error creating charity details:", charityError);
          }
        }

        toast({ title: "Company added successfully." });
      } else {
        // Insert into clients table
        const { data: client, error: clientError } = await supabase
          .from("clients")
          .insert({
            organization_id: organization.id,
            first_name: coreForm.first_name.trim(),
            last_name: coreForm.last_name.trim(),
            preferred_name: coreForm.preferred_name.trim() || null,
            email: coreForm.email.trim().toLowerCase(),
            phone: coreForm.phone.trim() || null,
            mobile_number: coreForm.mobile_number.trim() || null,
            client_type: clientType,
            utr: detailValues.utr?.trim() || null,
            nino: detailValues.nino?.trim().toUpperCase() || null,
          })
          .select()
          .single();

        if (clientError) throw clientError;

        // Insert type-specific details
        if (client && config.detailTable) {
          if (config.detailTable === 'client_detail_sa') {
            const { error: saError } = await supabase
              .from("client_detail_sa")
              .insert({
                client_id: client.id,
                organization_id: organization.id,
                is_mtd: clientType === 'sa_mtd',
                payment_on_account_jan: detailValues.payment_on_account_jan || null,
                payment_on_account_jul: detailValues.payment_on_account_jul || null,
                refund_expected: detailValues.refund_expected || false,
              });

            if (saError) {
              console.error("Error creating SA details:", saError);
            }
          } else if (config.detailTable === 'client_detail_partnership') {
            const { error: partnershipError } = await supabase
              .from("client_detail_partnership")
              .insert({
                client_id: client.id,
                organization_id: organization.id,
                partnership_utr: detailValues.utr?.trim() || null,
              });

            if (partnershipError) {
              console.error("Error creating partnership details:", partnershipError);
            }
          } else if (config.detailTable === 'client_detail_cgt') {
            const { error: cgtError } = await supabase
              .from("client_detail_cgt")
              .insert({
                client_id: client.id,
                organization_id: organization.id,
                disposal_date: detailValues.disposal_date || null,
              });

            if (cgtError) {
              console.error("Error creating CGT details:", cgtError);
            }
          }
        }

        toast({ title: "Client added successfully." });
      }

      queryClient.invalidateQueries({ queryKey: ["clients", organization.id] });
      queryClient.invalidateQueries({ queryKey: ["companies", organization.id] });
      setOpen(false);
      resetForm();
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
      resetForm();
    }
  };

  const isCompanyType = isCompanyBasedType(clientType);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Client
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
          <DialogDescription>
            Create a new client record with type-specific details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Client Type Selector */}
          <ClientTypeSelector
            value={clientType}
            onChange={(type) => {
              setClientType(type);
              setDetailValues({});
              setErrors({});
            }}
          />

          {/* Core Fields */}
          <div className="space-y-4">
            {isCompanyType ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name *</Label>
                  <Input
                    id="company_name"
                    value={coreForm.company_name}
                    onChange={(e) =>
                      setCoreForm({ ...coreForm, company_name: e.target.value })
                    }
                    className={errors.company_name ? "border-destructive" : ""}
                    maxLength={200}
                  />
                  <FormFieldError error={errors.company_name} />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name *</Label>
                    <Input
                      id="first_name"
                      value={coreForm.first_name}
                      onChange={(e) =>
                        setCoreForm({ ...coreForm, first_name: e.target.value })
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
                      value={coreForm.last_name}
                      onChange={(e) =>
                        setCoreForm({ ...coreForm, last_name: e.target.value })
                      }
                      className={errors.last_name ? "border-destructive" : ""}
                      maxLength={100}
                    />
                    <FormFieldError error={errors.last_name} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preferred_name">Preferred Name</Label>
                  <Input
                    id="preferred_name"
                    value={coreForm.preferred_name}
                    onChange={(e) =>
                      setCoreForm({ ...coreForm, preferred_name: e.target.value })
                    }
                    placeholder="How they prefer to be addressed"
                    maxLength={100}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={coreForm.email}
                onChange={(e) =>
                  setCoreForm({ ...coreForm, email: e.target.value })
                }
                className={errors.email ? "border-destructive" : ""}
                maxLength={255}
              />
              <FormFieldError error={errors.email} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={coreForm.phone}
                  onChange={(e) =>
                    setCoreForm({ ...coreForm, phone: e.target.value })
                  }
                  maxLength={20}
                />
              </div>
              {!isCompanyType && (
                <div className="space-y-2">
                  <Label htmlFor="mobile_number">Mobile</Label>
                  <Input
                    id="mobile_number"
                    type="tel"
                    value={coreForm.mobile_number}
                    onChange={(e) =>
                      setCoreForm({ ...coreForm, mobile_number: e.target.value })
                    }
                    maxLength={20}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Type-Specific Detail Fields */}
          <ClientDetailFields
            clientType={clientType}
            values={detailValues}
            onChange={handleDetailChange}
            errors={errors}
          />

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
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
