import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { sanitizeEmailHtml } from "@/lib/sanitizeHtml";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, Users, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SAMPLE_SUBJECT = "Engagement Letter For Jane Smith";
const SAMPLE_BODY = `<p>Dear Jane Smith,</p>
<p>Thank you for choosing <strong>{{firm_name}}</strong> to act for you. This letter sets out the basis on which we will provide our professional services.</p>
<p>This is a sample engagement letter rendered for preview purposes only. Edit your variants under Settings &rarr; Engagement Letter Variants to change the wording your clients will receive.</p>
<p>Yours sincerely,<br/>{{firm_name}}</p>`;

/** Shape returned by public_get_engagement_letter_for_signing. */
interface SigningView {
  found: boolean;
  error?: string;
  firm_name?: string;
  letter?: {
    id: string;
    document_content: string | null;
    status: string;
    signing_rule: "all" | "any";
    signed_at: string | null;
    expired: boolean;
  };
  signer?: {
    kind: "signatory";
    signatory_id: string;
    name: string | null;
    email: string;
    required: boolean;
    signed_at: string | null;
  } | null;
  progress?: {
    has_signatories: boolean;
    signing_rule: "all" | "any";
    required_total: number;
    required_signed: number;
    satisfied: boolean;
  };
  requires_personal_link?: boolean;
}

interface PreviewData {
  subject: string;
  body: string;
  firmName: string;
  isSample: boolean;
}

export default function EngagementLetterPreview() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PreviewData | null>(null);
  const [view, setView] = useState<SigningView | null>(null);
  // FUN-3: signing state — the emailed link is now an actual signing page.
  const [fullName, setFullName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [signedCount, setSignedCount] = useState<number | null>(null);
  const [allSigned, setAllSigned] = useState(false);

  const signer = view?.signer ?? null;
  const progress = view?.progress;
  const isMultiSignatory = (progress?.required_total ?? 0) > 1;
  const requiresPersonalLink = view?.requires_personal_link === true;
  const expired = view?.letter?.expired === true;

  const handleSign = async () => {
    if (!token) return;
    setSigning(true);
    try {
      const signatureData = { full_name: fullName.trim(), user_agent: navigator.userAgent };
      // A per-signatory link records THAT person's signature; a legacy letter-level link
      // still signs the letter as a whole.
      const { data: res, error: rpcErr } = await (supabase as any).rpc(
        signer
          ? "public_sign_engagement_letter_as_signatory"
          : "public_sign_engagement_letter_by_token",
        signer
          ? { p_token: token, p_signature_data: signatureData }
          : { p_signature_token: token, p_signature_data: signatureData },
      );
      if (rpcErr) throw rpcErr;
      const out = res as {
        success?: boolean;
        error?: string;
        signed_at?: string;
        all_signed?: boolean;
        progress?: SigningView["progress"];
      } | null;
      if (!out?.success) throw new Error(out?.error || "Could not record your signature.");

      setSignedAt(out.signed_at || new Date().toISOString());
      setAllSigned(out.all_signed ?? true);
      if (out.progress) setSignedCount(out.progress.required_signed);
      toast.success(
        out.all_signed === false
          ? "Thank you — your signature is recorded. We're waiting on the other signatories."
          : "Engagement letter signed. Thank you.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record your signature.");
    } finally {
      setSigning(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      if (token === "sample-token") {
        const firmName = "Your Firm";
        if (!cancelled) {
          setData({
            subject: SAMPLE_SUBJECT,
            body: SAMPLE_BODY.replace(/\{\{firm_name\}\}/g, firmName),
            firmName,
            isSample: true,
          });
          setLoading(false);
        }
        return;
      }
      try {
        // Read through the SECURITY DEFINER RPC: engagement_letters is RLS-protected with
        // no anon policy, so a client following their emailed link cannot query it directly.
        const { data: res, error: rpcErr } = await (supabase as any).rpc(
          "public_get_engagement_letter_for_signing",
          { p_token: token },
        );
        if (rpcErr) throw rpcErr;
        const out = (res ?? null) as SigningView | null;

        if (!out?.found) {
          if (!cancelled) {
            setError(out?.error || "This engagement letter link is invalid or has expired.");
            setLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setView(out);
          setData({
            subject: "Engagement Letter",
            body: out.letter?.document_content || "",
            firmName: out.firm_name || "Your Firm",
            isSample: false,
          });
          // A per-signatory link reflects THAT signatory's state; a letter-level link
          // reflects the letter's.
          setSignedAt(out.signer ? out.signer.signed_at : (out.letter?.signed_at ?? null));
          setAllSigned(out.progress?.satisfied ?? Boolean(out.letter?.signed_at));
          setSignedCount(out.progress?.required_signed ?? null);
          setFullName(out.signer?.name ?? "");
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || "Unable to load engagement letter.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Engagement Letter Unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {error || "We could not load this engagement letter."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progressLine =
    isMultiSignatory && progress
      ? `${signedCount ?? progress.required_signed} of ${progress.required_total} signatories have signed${
          progress.signing_rule === "any" ? " (any one signature completes this letter)" : ""
        }.`
      : null;

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {data.isSample && (
          <Card className="border-amber-500/40 bg-amber-500/10">
            <CardContent className="py-3 text-sm text-amber-900 dark:text-amber-100">
              Preview Mode &mdash; this is a sample engagement letter using placeholder data.
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">From {data.firmName}</p>
            <CardTitle className="text-2xl">{data.subject}</CardTitle>
            {signer && (
              <p className="text-sm text-muted-foreground">
                Prepared for {signer.name || signer.email}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(data.body) }}
            />
          </CardContent>
        </Card>

        {progressLine && (
          <Card>
            <CardContent className="py-3 flex items-center gap-3 text-sm text-muted-foreground">
              <Users className="h-4 w-4 shrink-0" />
              <span>{progressLine}</span>
            </CardContent>
          </Card>
        )}

        {/* FUN-3: signing. The emailed link now lets the client actually sign. */}
        {!data.isSample && (
          requiresPersonalLink ? (
            <Card className="border-amber-500/40 bg-amber-500/10">
              <CardContent className="py-4 flex items-start gap-3 text-amber-900 dark:text-amber-100">
                <MailWarning className="h-5 w-5 shrink-0 mt-0.5" />
                <span className="text-sm">
                  This engagement letter is signed by each signatory using the personal link
                  emailed to them. Please open the link from your own email, or ask your
                  accountant to resend it.
                </span>
              </CardContent>
            </Card>
          ) : signedAt ? (
            <Card className="border-emerald-500/40 bg-emerald-500/10">
              <CardContent className="py-4 flex items-center gap-3 text-emerald-900 dark:text-emerald-100">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span className="text-sm">
                  Signed on {new Date(signedAt).toLocaleString("en-GB")}.{" "}
                  {allSigned
                    ? "Thank you — no further action is needed."
                    : "Thank you — we're now waiting on the other signatories."}
                </span>
              </CardContent>
            </Card>
          ) : expired ? (
            <Card className="border-amber-500/40 bg-amber-500/10">
              <CardContent className="py-4 text-sm text-amber-900 dark:text-amber-100">
                This signing link has expired. Please ask your accountant to resend it.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sign this engagement letter</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full-name">Your full name</Label>
                  <Input
                    id="full-name"
                    placeholder="e.g. Jane Smith"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={signing}
                  />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    disabled={signing}
                  />
                  <span>
                    I confirm I have read and agree to the terms of this engagement letter, and that
                    typing my name constitutes my electronic signature.
                  </span>
                </label>
                <Button onClick={handleSign} disabled={signing || !fullName.trim() || !agreed}>
                  {signing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Sign engagement letter
                </Button>
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  );
}
