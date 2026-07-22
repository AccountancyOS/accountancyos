import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface QuoteLine {
  service_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  billing_frequency: string;
}
interface QuotePayload {
  quote_id: string;
  quote_number: string;
  status: string;
  currency: string;
  total_amount: number;
  valid_until: string | null;
  practice_name: string;
  recipient_name: string;
  lines: QuoteLine[];
  used: boolean;
  onboarding_application_id?: string | null;
  onboarding_access_token?: string | null;
  error?: string;
}

const fmt = (currency: string, n: number) => {
  // Intl.NumberFormat THROWS on a null/empty/invalid currency code, which would
  // crash the whole page to a blank screen. Default to GBP and never throw.
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GBP" }).format(Number(n || 0));
  } catch {
    return `${currency || "GBP"} ${Number(n || 0).toFixed(2)}`;
  }
};

// Build the onboarding URL, carrying the secret access token when we have it
// (Sprint 1 token enforcement). Falls back to the bare path for legacy links.
const onboardPath = (id: string, tok?: string | null) =>
  tok ? `/onboard/${id}?token=${encodeURIComponent(tok)}` : `/onboard/${id}`;

export default function PublicQuoteView() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"accept" | "reject" | null>(null);
  const [quote, setQuote] = useState<QuotePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"accepted" | "rejected" | null>(null);
  const [onboardingId, setOnboardingId] = useState<string | null>(null);
  const [onboardingToken, setOnboardingToken] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [resuming, setResuming] = useState(false);

  // Re-query the public quote endpoint for the onboarding id + its access token.
  // Both are needed: navigating to /onboard/:id WITHOUT a token hits the strict
  // token guard and fails with a cryptic "Invalid or missing onboarding access
  // token", so callers must never resume without a token in hand.
  const fetchOnboarding = async (): Promise<{ id: string | null; tok: string | null }> => {
    if (!token) return { id: null, tok: null };
    const { data } = await supabase.rpc("public_get_quote_by_token", { p_token: token });
    const qp = data as unknown as QuotePayload | null;
    return { id: qp?.onboarding_application_id ?? null, tok: qp?.onboarding_access_token ?? null };
  };

  // Manual resume: fetch the token then navigate. Surfaces a clear message instead
  // of dumping the client on a tokenless onboarding URL that is guaranteed to fail.
  const retryResume = async () => {
    setResuming(true);
    const { id, tok } = await fetchOnboarding();
    setResuming(false);
    const rid = id ?? onboardingId;
    if (rid && tok) {
      setOnboardingId(rid);
      setOnboardingToken(tok);
      navigate(onboardPath(rid, tok));
    } else {
      toast({
        title: "Still preparing your secure link",
        description: "Please refresh this page in a moment to continue to onboarding.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    // Safety net: never let this page stay blank on a stuck network/RPC.
    const safety = setTimeout(() => {
      if (cancelled) return;
      setLoading((prev) => {
        if (prev) setError((e) => e ?? "We could not load this proposal.");
        return false;
      });
    }, 15000);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("public_get_quote_by_token", { p_token: token });
        if (cancelled) return;
        if (error) {
          setError(error.message || "We could not load this proposal.");
        } else {
          const payload = (data ?? null) as unknown as QuotePayload | null;
          if (!payload || typeof payload !== "object") {
            setError("invalid");
          } else if (payload.error) {
            setError(payload.error);
          } else {
            setQuote(payload);
            if (payload.onboarding_application_id) setOnboardingId(payload.onboarding_application_id);
            if (payload.onboarding_access_token) setOnboardingToken(payload.onboarding_access_token);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "We could not load this proposal.");
      } finally {
        if (!cancelled) setLoading(false);
        clearTimeout(safety);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(safety);
    };
  }, [token]);

  // If the quote is already accepted and we know the onboarding app, resume automatically —
  // but ONLY once we have the access token. If it is accepted with an id but no token yet,
  // fetch the token once rather than navigating to a tokenless URL that would fail.
  useEffect(() => {
    if (!quote || quote.status !== "accepted" || !onboardingId) return;
    if (onboardingToken) {
      const t = setTimeout(() => navigate(onboardPath(onboardingId, onboardingToken)), 1200);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    (async () => {
      const { tok } = await fetchOnboarding();
      if (!cancelled && tok) setOnboardingToken(tok);
    })();
    return () => {
      cancelled = true;
    };
  }, [quote, onboardingId, onboardingToken, navigate]);

  const accept = async () => {
    if (!token) return;
    setSubmitting("accept");
    const { data, error } = await supabase.rpc("public_accept_quote_by_token", { p_token: token });
    setSubmitting(null);
    const payload = data as unknown as { success?: boolean; error?: string; onboarding_application_id?: string; onboarding_access_token?: string };
    if (error || payload?.error) {
      toast({ title: "Could not accept quote", description: error?.message || payload?.error, variant: "destructive" });
      return;
    }
    setDone("accepted");
    let appId = payload?.onboarding_application_id ?? null;
    let appToken = payload?.onboarding_access_token ?? null;
    // The accept RPC does not always include the onboarding id/token; re-query the
    // public quote endpoint (self-heals + returns both). Retry until we have BOTH the
    // id AND its access token — navigating to /onboard/:id without a token hits the
    // strict token guard and fails with a cryptic error, so we must not do that.
    for (let i = 0; i < 4 && (!appId || !appToken); i++) {
      const { id, tok } = await fetchOnboarding();
      if (id) appId = id;
      if (tok) appToken = tok;
      if (appId && appToken) break;
      await new Promise((r) => setTimeout(r, 600));
    }
    if (appId) setOnboardingId(appId);
    if (appToken) setOnboardingToken(appToken);
    if (appId && appToken) {
      setTimeout(() => navigate(onboardPath(appId, appToken)), 1000);
    } else {
      // Accepted, but the secure link is not ready. Do NOT navigate to a tokenless
      // URL; leave the accepted view showing a "Continue Onboarding" retry instead.
      toast({
        title: "Preparing your secure onboarding link",
        description: "Almost there — use the Continue Onboarding button below, or refresh if it doesn't appear.",
      });
    }
  };

  const confirmDecline = async () => {
    if (!token) return;
    setSubmitting("reject");
    const { data, error } = await supabase.rpc("public_reject_quote_by_token", {
      p_token: token,
      p_reason: declineReason.trim() || null,
    });
    setSubmitting(null);
    const payload = data as unknown as { success?: boolean; error?: string };
    if (error || payload?.error) {
      toast({ title: "Could not decline quote", description: error?.message || payload?.error, variant: "destructive" });
      return;
    }
    setDeclineOpen(false);
    setDone("rejected");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader><CardTitle>Proposal Unavailable</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {error === "expired"
                ? "This proposal link has expired. Please contact your accountant for a new link."
                : error === "invalid"
                ? "This proposal link is not valid."
                : "We could not load this proposal."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isFinal = done || quote.status === "accepted" || quote.status === "rejected" || quote.used;
  // Guard against a missing/null `lines` in the RPC payload (would crash .map to a blank screen).
  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  const practiceName = quote.practice_name || "Your Accountant";
  const recipientName = quote.recipient_name || "Client";
  const quoteNumber = quote.quote_number || "";
  const currency = quote.currency || "GBP";

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Proposal from</p>
          <h1 className="text-3xl font-semibold">{practiceName}</h1>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Proposal {quoteNumber}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Prepared for {recipientName}</p>
            </div>
            {quote.valid_until && (
              <p className="text-sm text-muted-foreground">
                Valid until {new Date(quote.valid_until).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-2">Service</th>
                    <th className="py-2 px-2 text-right">Qty</th>
                    <th className="py-2 px-2 text-right">Unit Price</th>
                    <th className="py-2 px-2 text-right">Frequency</th>
                    <th className="py-2 pl-2 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-3 pr-2">{l.service_name}</td>
                      <td className="py-3 px-2 text-right">{Number(l.quantity)}</td>
                      <td className="py-3 px-2 text-right">
                        {l.billing_frequency === "monthly" ? (
                          <>{fmt(currency, Number(l.unit_price || 0) / 12)}<span className="text-muted-foreground">/month</span></>
                        ) : (
                          fmt(currency, l.unit_price)
                        )}
                      </td>
                      <td className="py-3 px-2 text-right capitalize">{l.billing_frequency === "monthly" ? "Monthly" : "One-off"}</td>
                      <td className="py-3 pl-2 text-right">
                        {l.billing_frequency === "monthly" ? (
                          <>{fmt(currency, Number(l.subtotal || 0) / 12)}<span className="text-muted-foreground">/month</span></>
                        ) : (
                          fmt(currency, l.subtotal)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {(() => {
                    const monthly = lines
                      .filter((l) => l.billing_frequency === "monthly")
                      .reduce((s, l) => s + Number(l.subtotal || 0) / 12, 0);
                    const oneOff = lines
                      .filter((l) => l.billing_frequency !== "monthly")
                      .reduce((s, l) => s + Number(l.subtotal || 0), 0);
                    return (
                      <>
                        {oneOff > 0 && (
                          <tr>
                            <td colSpan={4} className="pt-4 text-right font-semibold">Due Now</td>
                            <td className="pt-4 pl-2 text-right font-semibold">{fmt(currency, oneOff)}</td>
                          </tr>
                        )}
                        {monthly > 0 && (
                          <tr>
                            <td colSpan={4} className="pt-2 text-right font-semibold">Monthly Recurring</td>
                            <td className="pt-2 pl-2 text-right font-semibold">
                              {fmt(currency, monthly)}<span className="text-muted-foreground font-normal">/month</span>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tfoot>
              </table>
            </div>

            <div className="mt-8 border-t pt-6">
              {done === "accepted" || quote.status === "accepted" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" />
                    <p>
                      Proposal accepted.{" "}
                      {onboardingId && !onboardingToken
                        ? "Preparing your secure onboarding link…"
                        : "Continuing to your onboarding…"}
                    </p>
                  </div>
                  {onboardingId && onboardingToken ? (
                    <Button onClick={() => navigate(onboardPath(onboardingId, onboardingToken))}>
                      Continue Onboarding
                    </Button>
                  ) : onboardingId ? (
                    <Button variant="outline" onClick={retryResume} disabled={resuming}>
                      {resuming ? "Preparing secure link…" : "Continue Onboarding"}
                    </Button>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    Next steps: sign your engagement letter, upload AML documents, set up billing
                    and activate your portal account.
                  </p>
                </div>
              ) : done === "rejected" || quote.status === "rejected" ? (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <XCircle className="h-5 w-5" />
                  <p>Proposal declined.</p>
                </div>
              ) : isFinal ? (
                <p className="text-sm text-muted-foreground">This proposal link has already been used.</p>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                  <Button variant="outline" onClick={() => setDeclineOpen(true)} disabled={!!submitting}>
                    Decline
                  </Button>
                  <Button onClick={accept} disabled={!!submitting}>
                    {submitting === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept Proposal"}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Decline Proposal</DialogTitle>
              <DialogDescription>
                Let {practiceName} know why you're declining (optional).
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Reason for declining"
              rows={4}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeclineOpen(false)} disabled={!!submitting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDecline} disabled={!!submitting}>
                {submitting === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Decline"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}