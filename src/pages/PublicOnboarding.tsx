import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Loader2, FileSignature, ShieldCheck, CreditCard, UserPlus, Upload } from "lucide-react";
import { toast } from "sonner";
import { sanitizeEmailHtml } from "@/lib/sanitizeHtml";

type Step = "engagement" | "aml" | "billing" | "portal" | "done";

interface AppBundle {
  application: any;
  organization: { id: string; name: string; logo_url?: string | null; has_stripe_connect?: boolean };
  quote: { id: string; quote_number: string; currency: string; accepted_snapshot: any } | null;
  documents: Array<{ id: string; document_type: string; file_name: string; file_path: string }>;
  engagement_letter: { id: string; signed_at: string | null; document_content?: string | null } | null;
}

const stepOrder: Step[] = ["engagement", "aml", "billing", "portal"];

function deriveStep(app: any): Step {
  if (!app) return "engagement";
  if (app.status === "for_review" || app.status === "approved") return "done";
  if (app.status === "portal_pending") return "portal";
  if (app.status === "billing_pending") return "billing";
  if (app.status === "aml_pending") return "aml";
  return "engagement";
}

// Sprint 1 token enforcement: the onboarding access token arrives in the URL
// (/onboard/:id?token=...). Read it from the current location so every public
// onboarding RPC can pass it. Returns undefined for legacy links with no token
// (the RPCs accept a NULL token and behave as before).
//
// The token is persisted to sessionStorage (keyed per application) so it
// survives a redirect that strips the query string — notably the Stripe
// billing round-trip, where the token MUST NOT be sent to the third party.
// It is read back from sessionStorage when the URL has no token.
const getAccessToken = (): string | undefined => {
  const id = window.location.pathname.split("/onboard/")[1]?.split(/[/?#]/)[0];
  const key = id ? `onboarding_token_${id}` : "onboarding_token";
  const urlToken = new URLSearchParams(window.location.search).get("token");
  if (urlToken) {
    try { sessionStorage.setItem(key, urlToken); } catch { /* storage unavailable */ }
    return urlToken;
  }
  try { return sessionStorage.getItem(key) ?? undefined; } catch { return undefined; }
};

export default function PublicOnboarding() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState<AppBundle | null>(null);
  const [step, setStep] = useState<Step>("engagement");

  const load = useCallback(async () => {
    if (!applicationId) return;
    const { data, error } = await supabase.rpc("public_get_onboarding", { p_application_id: applicationId, p_access_token: getAccessToken() });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const b = data as unknown as AppBundle;
    setBundle(b);
    setStep(deriveStep(b.application));
    setLoading(false);
  }, [applicationId]);

  useEffect(() => { load(); }, [load]);

  // Handle Stripe Checkout return
  useEffect(() => {
    const billing = searchParams.get("billing");
    const sessionId = searchParams.get("session_id");
    if (!applicationId || !billing) return;
    if (billing === "success" && sessionId) {
      (async () => {
        const { data, error } = await supabase.functions.invoke("onboarding-stripe-verify", {
          body: { application_id: applicationId, session_id: sessionId },
        });
        if (error || !data?.paid) {
          toast.error("Payment not confirmed yet. Refresh in a moment.");
        } else {
          toast.success("Payment received");
        }
        setSearchParams({}, { replace: true });
        load();
      })();
    } else if (billing === "cancelled") {
      toast.info("Payment cancelled. You can try again.");
      setSearchParams({}, { replace: true });
    }
  }, [applicationId, searchParams, setSearchParams, load]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Onboarding not found.
      </div>
    );
  }

  const practiceName = bundle.organization?.name ?? "your accountant";

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold">Welcome to {practiceName}</h1>
          <p className="text-muted-foreground">
            Complete the four steps below to finish your onboarding.
          </p>
        </header>

        <Stepper current={step} />

        {step === "engagement" && (
          <EngagementStep bundle={bundle} onDone={load} />
        )}
        {step === "aml" && (
          <AMLStep bundle={bundle} onDone={load} />
        )}
        {step === "billing" && (
          <BillingStep bundle={bundle} onDone={load} />
        )}
        {step === "portal" && (
          <PortalStep bundle={bundle} onDone={load} />
        )}
        {step === "done" && (
          <DoneCard practiceName={practiceName} />
        )}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const items: { key: Step; label: string; icon: any }[] = [
    { key: "engagement", label: "Engagement Letter", icon: FileSignature },
    { key: "aml", label: "AML Documents", icon: ShieldCheck },
    { key: "billing", label: "Billing", icon: CreditCard },
    { key: "portal", label: "Portal Account", icon: UserPlus },
  ];
  const currentIdx = current === "done" ? items.length : stepOrder.indexOf(current);
  return (
    <div className="flex items-center justify-between gap-2">
      {items.map((item, idx) => {
        const Icon = item.icon;
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={item.key} className="flex-1 flex items-center gap-2">
            <div
              className={`flex items-center justify-center h-9 w-9 rounded-full border ${
                done
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground"
              }`}
            >
              {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </div>
            <span className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}>
              {item.label}
            </span>
            {idx < items.length - 1 && <div className="flex-1 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------- Step 1: Engagement Letter -------------------- */
function EngagementStep({ bundle, onDone }: { bundle: AppBundle; onDone: () => void }) {
  const [signature, setSignature] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [letterHtml, setLetterHtml] = useState<string | null>(
    bundle.engagement_letter?.document_content ?? null
  );
  const [loadingLetter, setLoadingLetter] = useState(!bundle.engagement_letter?.document_content);

  const snapshot = bundle.quote?.accepted_snapshot;
  const lines = (snapshot?.lines ?? []) as any[];
  const currency = bundle.quote?.currency ?? "GBP";

  useEffect(() => {
    if (letterHtml) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("public_preview_engagement_letter", {
        p_application_id: bundle.application.id,
        p_access_token: getAccessToken(),
      });
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
      } else if (typeof data === "string") {
        setLetterHtml(data);
      }
      setLoadingLetter(false);
    })();
    return () => { cancelled = true; };
  }, [bundle.application.id, letterHtml]);

  const sign = async () => {
    if (!signature.trim() || !confirmed) {
      toast.error("Please type your full name and confirm acceptance.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("public_sign_engagement_letter", {
      p_application_id: bundle.application.id,
      p_access_token: getAccessToken(),
      p_signature_data: {
        signed_name: signature,
        signed_at: new Date().toISOString(),
        user_agent: navigator.userAgent,
      },
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Engagement letter signed");
    onDone();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 1 — Sign Engagement Letter</CardTitle>
        <CardDescription>
          Please review the scope of services and confirm acceptance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-md bg-background">
          <div className="max-h-[420px] overflow-y-auto p-5 text-sm prose prose-sm dark:prose-invert max-w-none [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-0 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4">
            {loadingLetter ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading engagement letter…
              </div>
            ) : letterHtml ? (
              <div dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(letterHtml) }} />
            ) : (
              <p className="text-muted-foreground">Engagement letter unavailable.</p>
            )}
          </div>
        </div>

        <div className="border rounded-md p-4 bg-background text-sm space-y-2">
          <p><strong>Practice:</strong> {bundle.organization.name}</p>
          <p><strong>Client:</strong> {bundle.application.company_name || `${bundle.application.first_name ?? ""} ${bundle.application.last_name ?? ""}`}</p>
          <Separator />
          <p className="font-medium">Scope Summary</p>
          <ul className="list-disc pl-5 space-y-1">
            {lines.length === 0 && <li className="text-muted-foreground">No services listed.</li>}
            {lines.map((l, i) => (
              <li key={i}>
                {l.service_name} — {currency} {Number(l.subtotal).toFixed(2)}{" "}
                <span className="text-muted-foreground">({l.billing_frequency ?? "annual"})</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sig">Type your full name to sign</Label>
          <Input id="sig" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Full name" />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>I have read and accept the terms of the engagement letter above.</span>
        </label>

        <Button onClick={sign} disabled={submitting} className="w-full">
          {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSignature className="h-4 w-4 mr-2" />}
          Sign & Continue
        </Button>
      </CardContent>
    </Card>
  );
}

/* -------------------- Step 2: AML Documents -------------------- */
function AMLStep({ bundle, onDone }: { bundle: AppBundle; onDone: () => void }) {
  const idDoc = bundle.documents.find((d) => d.document_type === "id");
  const poaDoc = bundle.documents.find((d) => d.document_type === "proof_of_address");
  const isCompany = bundle.application.application_type === "company";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 2 — Upload AML Documents</CardTitle>
        <CardDescription>
          For anti-money-laundering compliance we need verified identity documents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <UploadRow
          label="Photo ID (passport or driving licence)"
          docType="id"
          existing={idDoc}
          bundle={bundle}
          onUploaded={onDone}
        />
        <UploadRow
          label="Proof of address (utility bill or bank statement, within 3 months)"
          docType="proof_of_address"
          existing={poaDoc}
          bundle={bundle}
          onUploaded={onDone}
        />
        {isCompany && (
          <UploadRow
            label="Certificate of incorporation (optional)"
            docType="incorporation_cert"
            existing={bundle.documents.find((d) => d.document_type === "incorporation_cert")}
            bundle={bundle}
            onUploaded={onDone}
          />
        )}
        <p className="text-xs text-muted-foreground">
          You will move to the next step once both required documents are uploaded.
        </p>
      </CardContent>
    </Card>
  );
}

function UploadRow({
  label, docType, existing, bundle, onUploaded,
}: {
  label: string;
  docType: string;
  existing?: { file_name: string };
  bundle: AppBundle;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${bundle.organization.id}/onboarding/${bundle.application.id}/${docType}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("onboarding-documents")
      .upload(path, file, { upsert: false });
    if (upErr) {
      toast.error(upErr.message);
      setUploading(false);
      return;
    }
    const { error: rpcErr } = await supabase.rpc("public_record_aml_upload", {
      p_application_id: bundle.application.id,
      p_access_token: getAccessToken(),
      p_document_type: docType,
      p_file_name: file.name,
      p_file_path: path,
      p_file_size: file.size,
      p_mime_type: file.type || "application/octet-stream",
    });
    setUploading(false);
    if (rpcErr) { toast.error(rpcErr.message); return; }
    toast.success("Uploaded");
    onUploaded();
  };

  return (
    <div className="border rounded-md p-3 flex items-center justify-between gap-3">
      <div className="text-sm">
        <div className="font-medium">{label}</div>
        {existing ? (
          <div className="text-xs text-emerald-700">Uploaded: {existing.file_name}</div>
        ) : (
          <div className="text-xs text-muted-foreground">Not yet uploaded</div>
        )}
      </div>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
        <Button
          variant={existing ? "outline" : "default"}
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          {existing ? "Replace" : "Upload"}
        </Button>
      </div>
    </div>
  );
}

/* -------------------- Step 3: Billing -------------------- */
function BillingStep({ bundle, onDone }: { bundle: AppBundle; onDone: () => void }) {
  const snapshot = bundle.quote?.accepted_snapshot;
  const totalNow = Number(snapshot?.total_now ?? 0);
  const totalMonthly = Number(snapshot?.total_monthly ?? 0);
  const currency = bundle.quote?.currency ?? "GBP";
  const hasConnect = !!bundle.organization.has_stripe_connect;
  const [submitting, setSubmitting] = useState(false);

  const payWithStripe = async () => {
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("onboarding-stripe-checkout", {
      body: { application_id: bundle.application.id },
    });
    if (error || !data?.url) {
      setSubmitting(false);
      toast.error(error?.message ?? data?.error ?? "Could not start checkout");
      return;
    }
    window.location.href = data.url as string;
  };

  const skip = async () => {
    setSubmitting(true);
    const { error } = await supabase.rpc("public_skip_billing", {
      p_application_id: bundle.application.id,
      p_access_token: getAccessToken(),
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Billing acknowledged — your accountant will confirm payment details.");
    onDone();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 3 — Billing</CardTitle>
        <CardDescription>Review the fees from your accepted proposal and set up payment.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-md p-4 bg-background text-sm space-y-1">
          <div className="flex justify-between"><span>Payable now</span><strong>{currency} {totalNow.toFixed(2)}</strong></div>
          <div className="flex justify-between"><span>Payable monthly</span><strong>{currency} {totalMonthly.toFixed(2)}</strong></div>
        </div>

        {hasConnect ? (
          <>
            <p className="text-xs text-muted-foreground">
              You will be redirected to a secure Stripe checkout to enter your payment details.
              {totalMonthly > 0 ? " A recurring monthly subscription will be created" : ""}
              {totalMonthly > 0 && totalNow > 0 ? "; any one-off services will be added to your first invoice." : "."}
            </p>
            <Button onClick={payWithStripe} disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
              Pay With Stripe
            </Button>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {bundle.organization.name} has not yet connected an online payment account, so they will
              arrange billing with you directly (invoice or direct debit). Acknowledge to continue.
            </p>
            <Button onClick={skip} disabled={submitting} className="w-full" variant="secondary">
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
              Acknowledge & Continue
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------- Step 4: Portal Account -------------------- */
function PortalStep({ bundle, onDone }: { bundle: AppBundle; onDone: () => void }) {
  const [email, setEmail] = useState<string>(bundle.application.email ?? "");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!email.trim()) { toast.error("Email is required."); return; }
    setSubmitting(true);
    const { error } = await supabase.rpc("public_submit_onboarding_for_review", {
      p_application_id: bundle.application.id,
      p_access_token: getAccessToken(),
      p_portal_email: email.trim(),
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Submitted for review");
    onDone();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 4 — Client Portal Account</CardTitle>
        <CardDescription>
          Confirm the email address you would like to use for your client portal. {bundle.organization.name} will email you a secure sign-in link once your onboarding is approved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="portal-email">Portal email</Label>
          <Input id="portal-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button onClick={submit} disabled={submitting} className="w-full">
          {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
          Submit for Review
        </Button>
      </CardContent>
    </Card>
  );
}

/* -------------------- Done -------------------- */
function DoneCard({ practiceName }: { practiceName: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="h-6 w-6" />
          <CardTitle>Onboarding Submitted</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Thank you. Your onboarding has been submitted to <strong>{practiceName}</strong> for review.
        </p>
        <p>
          You will receive a confirmation email and portal sign-in link once your accountant has approved your account.
        </p>
      </CardContent>
    </Card>
  );
}
