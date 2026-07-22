import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Building2, Info } from "lucide-react";
import type { ServiceFlags } from "./types";

interface BusinessSectionProps {
  isCompany: boolean;
  utr: string;
  onUtrChange: (v: string) => void;
  vatNumber: string;
  onVatNumberChange: (v: string) => void;
  payeReference: string;
  onPayeReferenceChange: (v: string) => void;
  services: ServiceFlags;
  companyName: string | null;
  companyNumber: string | null;
  chCorrectionNote: string;
  onChCorrectionNoteChange: (v: string) => void;
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export default function BusinessSection({
  isCompany,
  utr,
  onUtrChange,
  vatNumber,
  onVatNumberChange,
  payeReference,
  onPayeReferenceChange,
  services,
  companyName,
  companyNumber,
  chCorrectionNote,
  onChCorrectionNoteChange,
}: BusinessSectionProps) {
  return (
    <div className="space-y-5">
      {(companyName || companyNumber) && (
        <div className="border rounded-md p-4 bg-muted/40 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Company record on file</span>
            <Badge variant="secondary" className="text-[10px]">from Companies House</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {companyName && (
              <div>
                <div className="text-xs text-muted-foreground">Company name</div>
                <div className="font-medium">{companyName}</div>
              </div>
            )}
            {companyNumber && (
              <div>
                <div className="text-xs text-muted-foreground">Company number</div>
                <div className="font-medium">{companyNumber}</div>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            These are read-only here — we don't edit Companies House data directly. If
            something looks wrong, flag it below and your accountant will follow it up.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="ch-correction" className="text-xs">Flag a correction (optional)</Label>
            <Textarea
              id="ch-correction"
              value={chCorrectionNote}
              onChange={(e) => onChCorrectionNoteChange(e.target.value)}
              placeholder="e.g. our trading name has changed, or the company number above looks wrong"
              className="text-sm"
              rows={2}
            />
          </div>
        </div>
      )}

      {isCompany && (
        <div className="space-y-2">
          <Label htmlFor="business-utr">Company UTR</Label>
          <Input
            id="business-utr"
            value={utr}
            onChange={(e) => onUtrChange(e.target.value)}
            placeholder="10-digit UTR"
            maxLength={10}
          />
          <FieldHint>
            We need this to file your Corporation Tax return with HMRC.
          </FieldHint>
        </div>
      )}

      {!isCompany && (
        <p className="text-xs text-muted-foreground">
          Your own tax reference (UTR) is captured in the "About you" section below,
          alongside your other personal details.
        </p>
      )}

      {services.vat && (
        <div className="space-y-2">
          <Label htmlFor="business-vat">VAT number</Label>
          <Input
            id="business-vat"
            value={vatNumber}
            onChange={(e) => onVatNumberChange(e.target.value)}
            placeholder="e.g. GB123456789"
          />
          <FieldHint>
            Your accepted proposal includes a VAT service — we need your VAT registration
            number to prepare and file your VAT returns.
          </FieldHint>
        </div>
      )}

      {services.payroll && (
        <div className="space-y-2">
          <Label htmlFor="business-paye">PAYE reference</Label>
          <Input
            id="business-paye"
            value={payeReference}
            onChange={(e) => onPayeReferenceChange(e.target.value)}
            placeholder="e.g. 123/AB45678"
          />
          <FieldHint>
            Your accepted proposal includes a payroll service — we need your employer
            PAYE reference to run payroll and submit RTI filings.
          </FieldHint>
        </div>
      )}

      {!services.vat && !services.payroll && (
        <p className="text-xs text-muted-foreground">
          No VAT or payroll services on your accepted proposal, so we don't need a VAT
          number or PAYE reference from you right now.
        </p>
      )}
    </div>
  );
}
