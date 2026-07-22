import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import BusinessSection from "./BusinessSection";
import PeopleSection from "./PeopleSection";
import OutstandingItems from "./OutstandingItems";
import { type PersonDetail, emptyPerson, toPersistedPerson, deriveServiceFlags } from "./types";

interface YourDetailsStepProps {
  // AppBundle from PublicOnboarding.tsx (application/organization/quote/documents/engagement_letter)
  bundle: any;
  getAccessToken: () => string | null;
  onContinue: () => void;
}

export default function YourDetailsStep({ bundle, getAccessToken, onContinue }: YourDetailsStepProps) {
  const app = bundle.application;
  const isCompany = app.application_type === "company";
  const services = useMemo(
    () => deriveServiceFlags(bundle.quote?.accepted_snapshot?.lines ?? []),
    [bundle.quote],
  );

  const [utr, setUtr] = useState<string>(app.utr ?? "");
  const [vatNumber, setVatNumber] = useState<string>(app.vat_number ?? "");
  const [payeReference, setPayeReference] = useState<string>(app.paye_reference ?? "");
  const [chCorrectionNote, setChCorrectionNote] = useState<string>(app.ch_correction_note ?? "");
  const [people, setPeople] = useState<PersonDetail[]>(() => seedPeople(app, isCompany));
  const [saving, setSaving] = useState(false);

  const save = async (advance: boolean) => {
    const token = getAccessToken();
    if (!token) {
      toast.error("Session expired — please reopen your onboarding link from the original email.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("public_save_onboarding_details" as any, {
      p_application_id: app.id,
      p_access_token: token,
      p_utr: utr.trim() || null,
      p_vat_number: vatNumber.trim() || null,
      p_paye_reference: payeReference.trim() || null,
      p_personal_details: people.map(toPersistedPerson),
      p_ch_correction_note: chCorrectionNote.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(advance ? "Details saved" : "Progress saved");
    if (advance) onContinue();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Details</CardTitle>
        <CardDescription>
          Tell us a bit more about {isCompany ? "the company and its directors/shareholders" : "yourself"}{" "}
          so we can register you correctly with HMRC. You can save progress and come back later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Business</h3>
          <BusinessSection
            isCompany={isCompany}
            utr={utr}
            onUtrChange={setUtr}
            vatNumber={vatNumber}
            onVatNumberChange={setVatNumber}
            payeReference={payeReference}
            onPayeReferenceChange={setPayeReference}
            services={services}
            companyName={isCompany ? app.company_name ?? null : null}
            companyNumber={isCompany ? app.company_number ?? null : null}
            chCorrectionNote={chCorrectionNote}
            onChCorrectionNoteChange={setChCorrectionNote}
          />
        </section>

        <Separator />

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">
            {isCompany ? "Directors & shareholders" : "About you"}
          </h3>
          <PeopleSection
            people={people}
            onChange={setPeople}
            allowAddRemove={isCompany}
            addLabel={isCompany ? "Add a director or shareholder" : undefined}
          />
        </section>

        <Separator />

        <OutstandingItems
          isCompany={isCompany}
          utr={utr}
          vatNumber={vatNumber}
          payeReference={payeReference}
          services={services}
          people={people}
        />

        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => save(false)} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save progress
          </Button>
          <Button type="button" onClick={() => save(true)} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ClipboardCheck className="h-4 w-4 mr-2" />
            )}
            Save & Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function seedPeople(app: any, isCompany: boolean): PersonDetail[] {
  const existing = Array.isArray(app.personal_details) ? app.personal_details : null;
  if (existing && existing.length > 0) {
    return existing.map((p: any) => ({
      _key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: p?.name ?? "",
      role: p?.role ?? "",
      date_of_birth: p?.date_of_birth ?? "",
      nino: p?.nino ?? "",
      utr: p?.utr ?? "",
      home_address: {
        line1: p?.home_address?.line1 ?? "",
        line2: p?.home_address?.line2 ?? "",
        city: p?.home_address?.city ?? "",
        county: p?.home_address?.county ?? "",
        postcode: p?.home_address?.postcode ?? "",
        country: p?.home_address?.country ?? "United Kingdom",
      },
    }));
  }
  if (isCompany) {
    // No director/officer data is exposed by public_get_onboarding during onboarding (no
    // Companies House or company_persons data reaches the anon bundle) -- degrade
    // gracefully and let the applicant add people manually. See frontend report.
    return [];
  }
  // Individual application: there's no separate person register, so seed a single
  // locked "you" entry from the applicant's own name already on the application.
  const name = [app.first_name, app.last_name].filter(Boolean).join(" ").trim();
  return [emptyPerson(name, "Applicant")];
}
