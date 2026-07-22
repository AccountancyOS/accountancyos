import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Building2, User, MapPin } from "lucide-react";

// Firm-side view of what the client entered on the onboarding "Your details" step
// (public_save_onboarding_details -> onboarding_applications.utr / vat_number /
// paye_reference / ch_correction_note / personal_details).

interface HomeAddress {
  line1?: string;
  line2?: string;
  city?: string;
  county?: string;
  postcode?: string;
  country?: string;
}

interface PersonDetail {
  name?: string;
  role?: string;
  date_of_birth?: string;
  nino?: string;
  utr?: string;
  home_address?: HomeAddress;
}

function formatAddress(a?: HomeAddress): string | null {
  if (!a) return null;
  const parts = [a.line1, a.line2, a.city, a.county, a.postcode, a.country].filter((x) => x && x.trim());
  return parts.length > 0 ? parts.join(", ") : null;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value?.trim() ? value : <span className="text-muted-foreground font-normal">Not provided</span>}</div>
    </div>
  );
}

interface CapturedDetailsPanelProps {
  application: any;
}

export default function CapturedDetailsPanel({ application }: CapturedDetailsPanelProps) {
  const isCompany = application.application_type === "company";
  const people: PersonDetail[] = Array.isArray(application.personal_details)
    ? application.personal_details
    : [];

  const hasAnyBusinessField = !!(application.utr || application.vat_number || application.paye_reference || application.ch_correction_note);

  if (!hasAnyBusinessField && people.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Captured Details</CardTitle>
          <CardDescription>What the client entered on the "Your details" onboarding step.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nothing captured yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Captured Details</CardTitle>
        <CardDescription>What the client entered on the "Your details" onboarding step.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Business</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={isCompany ? "Company UTR" : "UTR"} value={application.utr} />
            <Field label="VAT number" value={application.vat_number} />
            <Field label="PAYE reference" value={application.paye_reference} />
          </div>
          {application.ch_correction_note && (
            <div className="mt-3 border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 rounded-md p-3">
              <div className="text-xs font-medium text-amber-900 dark:text-amber-100 mb-1">
                Client flagged a Companies House correction
              </div>
              <p className="text-sm text-amber-800 dark:text-amber-200">{application.ch_correction_note}</p>
            </div>
          )}
        </div>

        {people.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  Individuals ({people.length})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {people.map((p, idx) => (
                  <div key={idx} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{p.name?.trim() || `Person ${idx + 1}`}</span>
                      {p.role && <Badge variant="outline" className="text-[10px]">{p.role}</Badge>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Date of birth" value={p.date_of_birth} />
                      <Field label="NINO" value={p.nino} />
                      <Field label="Personal UTR" value={p.utr} />
                    </div>
                    <div className="flex items-start gap-1.5 text-xs">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <span className="text-muted-foreground">
                        {formatAddress(p.home_address) ?? "No address provided"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
