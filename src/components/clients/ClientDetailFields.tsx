import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormFieldError } from "@/components/ui/form-field-error";
import { type ClientType, getClientTypeConfig } from "@/lib/client-types";

interface ClientDetailFieldsProps {
  clientType: ClientType;
  values: Record<string, any>;
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
}

export function ClientDetailFields({
  clientType,
  values,
  onChange,
  errors,
}: ClientDetailFieldsProps) {
  const config = getClientTypeConfig(clientType);

  if (!config.detailTable && clientType === 'other') {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No additional fields required for this client type.
      </p>
    );
  }

  return (
    <div className="space-y-4 pt-4 border-t">
      <h4 className="text-sm font-medium text-muted-foreground">
        Type-Specific Details
      </h4>

      {/* UTR field */}
      {config.showUtr && (
        <div className="space-y-2">
          <Label htmlFor="utr">UTR (Unique Taxpayer Reference)</Label>
          <Input
            id="utr"
            value={values.utr || ""}
            onChange={(e) => onChange("utr", e.target.value)}
            placeholder="1234567890"
            maxLength={10}
            className={errors.utr ? "border-destructive" : ""}
          />
          <FormFieldError error={errors.utr} />
        </div>
      )}

      {/* NINO field */}
      {config.showNino && (
        <div className="space-y-2">
          <Label htmlFor="nino">National Insurance Number</Label>
          <Input
            id="nino"
            value={values.nino || ""}
            onChange={(e) => onChange("nino", e.target.value.toUpperCase())}
            placeholder="AB123456C"
            maxLength={9}
            className={errors.nino ? "border-destructive" : ""}
          />
          <FormFieldError error={errors.nino} />
        </div>
      )}

      {/* Company Number field */}
      {config.showCompanyNumber && (
        <div className="space-y-2">
          <Label htmlFor="company_number">Company Number</Label>
          <Input
            id="company_number"
            value={values.company_number || ""}
            onChange={(e) => onChange("company_number", e.target.value.toUpperCase())}
            placeholder="12345678"
            maxLength={8}
            className={errors.company_number ? "border-destructive" : ""}
          />
          <FormFieldError error={errors.company_number} />
        </div>
      )}

      {/* VAT Number field */}
      {config.showVat && (
        <div className="space-y-2">
          <Label htmlFor="vat_number">VAT Number</Label>
          <Input
            id="vat_number"
            value={values.vat_number || ""}
            onChange={(e) => onChange("vat_number", e.target.value.toUpperCase())}
            placeholder="GB123456789"
            maxLength={14}
            className={errors.vat_number ? "border-destructive" : ""}
          />
          <FormFieldError error={errors.vat_number} />
        </div>
      )}

      {/* Charity Number field */}
      {config.showCharityNumber && (
        <div className="space-y-2">
          <Label htmlFor="charity_number">Charity Number</Label>
          <Input
            id="charity_number"
            value={values.charity_number || ""}
            onChange={(e) => onChange("charity_number", e.target.value)}
            placeholder="1234567"
            maxLength={10}
            className={errors.charity_number ? "border-destructive" : ""}
          />
          <FormFieldError error={errors.charity_number} />
        </div>
      )}

      {/* MTD toggle for SA clients */}
      {config.showMtdQuarters && (
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="is_mtd">Making Tax Digital</Label>
            <p className="text-xs text-muted-foreground">
              Client is enrolled in MTD for Income Tax
            </p>
          </div>
          <Switch
            id="is_mtd"
            checked={values.is_mtd || false}
            onCheckedChange={(checked) => onChange("is_mtd", checked)}
          />
        </div>
      )}

      {/* Disposal Date for CGT */}
      {config.showDisposalDate && (
        <div className="space-y-2">
          <Label htmlFor="disposal_date">Disposal Date</Label>
          <Input
            id="disposal_date"
            type="date"
            value={values.disposal_date || ""}
            onChange={(e) => onChange("disposal_date", e.target.value)}
            className={errors.disposal_date ? "border-destructive" : ""}
          />
          <FormFieldError error={errors.disposal_date} />
          <p className="text-xs text-muted-foreground">
            Date of property disposal for 60-day CGT return
          </p>
        </div>
      )}

      {/* Payments on Account for SA */}
      {(clientType === 'sa_non_mtd' || clientType === 'sa_mtd') && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="poa_jan">POA (31 January)</Label>
              <Input
                id="poa_jan"
                type="number"
                step="0.01"
                value={values.payment_on_account_jan || ""}
                onChange={(e) => onChange("payment_on_account_jan", parseFloat(e.target.value) || null)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="poa_jul">POA (31 July)</Label>
              <Input
                id="poa_jul"
                type="number"
                step="0.01"
                value={values.payment_on_account_jul || ""}
                onChange={(e) => onChange("payment_on_account_jul", parseFloat(e.target.value) || null)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="refund_expected">Refund Expected</Label>
              <p className="text-xs text-muted-foreground">
                Client expects a refund this year
              </p>
            </div>
            <Switch
              id="refund_expected"
              checked={values.refund_expected || false}
              onCheckedChange={(checked) => onChange("refund_expected", checked)}
            />
          </div>
        </>
      )}

      {/* Charity specific fields */}
      {clientType === 'charity' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="trading_as">Trading As</Label>
            <Input
              id="trading_as"
              value={values.trading_as || ""}
              onChange={(e) => onChange("trading_as", e.target.value)}
              placeholder="Charity trading name"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="charity_year_end">Charity Year End</Label>
            <Input
              id="charity_year_end"
              type="date"
              value={values.charity_year_end || ""}
              onChange={(e) => onChange("charity_year_end", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gift_aid_expiry">Gift Aid Claim Expiry</Label>
            <Input
              id="gift_aid_expiry"
              type="date"
              value={values.gift_aid_claim_expiry || ""}
              onChange={(e) => onChange("gift_aid_claim_expiry", e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  );
}
