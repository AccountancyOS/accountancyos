import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { ClientDetailFields } from "./ClientDetailFields";
import { FormFieldError } from "@/components/ui/form-field-error";
import {
  type ClientType,
  isCompanyBasedType,
  getClientTypeConfig,
  CLIENT_TYPE_LABELS,
} from "@/lib/client-types";

interface EditClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: any;
  organizationId: string;
}

export function EditClientDialog({
  open,
  onOpenChange,
  client,
  organizationId,
}: EditClientDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clientType = (client?.client_type || "other") as ClientType;
  const isCompanyType = isCompanyBasedType(clientType);

  const [coreForm, setCoreForm] = useState({
    first_name: "",
    last_name: "",
    preferred_name: "",
    company_name: "",
    email: "",
    phone: "",
    mobile_number: "",
  });

  const [detailValues, setDetailValues] = useState<Record<string, any>>({});

  // Sync form when client changes
  useEffect(() => {
    if (client) {
      setCoreForm({
        first_name: client.first_name || "",
        last_name: client.last_name || "",
        preferred_name: client.preferred_name || "",
        company_name: client.company_name || "",
        email: client.email || "",
        phone: client.phone || "",
        mobile_number: client.mobile_number || "",
      });

      // Load detail values from joined detail tables
      const details: Record<string, any> = {
        utr: client.utr || "",
        nino: client.nino || "",
      };

      // SA details
      if (client.client_detail_sa?.[0]) {
        const sa = client.client_detail_sa[0];
        details.is_mtd = sa.is_mtd || false;
        details.payment_on_account_jan = sa.payment_on_account_jan || "";
        details.payment_on_account_jul = sa.payment_on_account_jul || "";
        details.refund_expected = sa.refund_expected || false;
      }

      // CGT details
      if (client.client_detail_cgt?.[0]) {
        const cgt = client.client_detail_cgt[0];
        details.disposal_date = cgt.disposal_date || "";
      }

      // Partnership details
      if (client.client_detail_partnership?.[0]) {
        const partnership = client.client_detail_partnership[0];
        details.partnership_utr = partnership.partnership_utr || "";
      }

      // Charity details
      if (client.client_detail_charity?.[0]) {
        const charity = client.client_detail_charity[0];
        details.charity_number = charity.charity_number || "";
        details.trading_as = charity.trading_as || "";
        details.charity_year_end = charity.charity_year_end || "";
        details.gift_aid_claim_expiry = charity.gift_aid_claim_expiry || "";
      }

      setDetailValues(details);
      setErrors({});
    }
  }, [client]);

  const handleDetailChange = (field: string, value: any) => {
    setDetailValues((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (isCompanyType) {
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !validateForm()) {
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

      if (isCompanyType) {
        // Update companies table
        const { error: companyError } = await supabase
          .from("companies")
          .update({
            company_name: coreForm.company_name.trim(),
            email: coreForm.email.trim().toLowerCase(),
            phone: coreForm.phone.trim() || null,
          })
          .eq("id", client.id);

        if (companyError) throw companyError;
      } else {
        // Update clients table
        const { error: clientError } = await supabase
          .from("clients")
          .update({
            first_name: coreForm.first_name.trim(),
            last_name: coreForm.last_name.trim(),
            preferred_name: coreForm.preferred_name.trim() || null,
            email: coreForm.email.trim().toLowerCase(),
            phone: coreForm.phone.trim() || null,
            mobile_number: coreForm.mobile_number.trim() || null,
            utr: detailValues.utr?.trim() || null,
            nino: detailValues.nino?.trim().toUpperCase() || null,
          })
          .eq("id", client.id);

        if (clientError) throw clientError;

        // Update type-specific detail table
        if (config.detailTable === "client_detail_sa") {
          const { error: saError } = await supabase
            .from("client_detail_sa")
            .upsert({
              client_id: client.id,
              organization_id: organizationId,
              is_mtd: detailValues.is_mtd || false,
              payment_on_account_jan: detailValues.payment_on_account_jan || null,
              payment_on_account_jul: detailValues.payment_on_account_jul || null,
              refund_expected: detailValues.refund_expected || false,
            });

          if (saError) console.error("SA update error:", saError);
        } else if (config.detailTable === "client_detail_cgt") {
          const { error: cgtError } = await supabase
            .from("client_detail_cgt")
            .upsert({
              client_id: client.id,
              organization_id: organizationId,
              disposal_date: detailValues.disposal_date || null,
            });

          if (cgtError) console.error("CGT update error:", cgtError);
        } else if (config.detailTable === "client_detail_partnership") {
          const { error: partnershipError } = await supabase
            .from("client_detail_partnership")
            .upsert({
              client_id: client.id,
              organization_id: organizationId,
              partnership_utr: detailValues.partnership_utr || null,
            });

          if (partnershipError) console.error("Partnership update error:", partnershipError);
        }
      }

      toast({ title: "Client updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["clients", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["companies", organizationId] });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error updating client",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Client</DialogTitle>
          <DialogDescription>
            Update client information. Type: {CLIENT_TYPE_LABELS[clientType]}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Core Fields */}
          <div className="space-y-4">
            {isCompanyType ? (
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
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
