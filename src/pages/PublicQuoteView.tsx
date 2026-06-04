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
  error?: string;
}

const fmt = (currency: string, n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(n || 0));

export default function PublicQuoteView() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"accept" | "reject" | null>(null);
  const [quote, setQuote] = useState<QuotePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"accepted" | "rejected" | null>(null);
  const [onboardingId, setOnboardingId] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await supabase.rpc("public_get_quote_by_token", { p_token: token });
      if (error) {
        setError(error.message);
      } else {
        const payload = data as unknown as QuotePayload;
        if (payload?.error) setError(payload.error);
        else {
          setQuote(payload);
          if (payload?.onboarding_application_id) {
            setOnboardingId(payload.onboarding_application_id);
          }
        }
      }
      setLoading(false);
    })();
  }, [token]);

  // If the quote is already accepted and we know the onboarding app, resume automatically.
  useEffect(() => {
    if (!quote) return;
    if (quote.status === "accepted" && onboardingId) {
      const t = setTimeout(() => navigate(`/onboard/${onboardingId}`), 1200);
      return () => clearTimeout(t);
    }
  }, [quote, onboardingId, navigate]);

  const accept = async () => {
    if (!token) return;
    setSubmitting("accept");
    const { data, error } = await supabase.rpc("public_accept_quote_by_token", { p_token: token });
    setSubmitting(null);
    const payload = data as unknown as { success?: boolean; error?: string; onboarding_application_id?: string };
    if (error || payload?.error) {
      toast({ title: "Could not accept quote", description: error?.message || payload?.error, variant: "destructive" });
      return;
    }
    setDone("accepted");
    if (payload?.onboarding_application_id) {
      setOnboardingId(payload.onboarding_application_id);
      // Hand off to the onboarding wizard shortly after the confirmation renders
      setTimeout(() => navigate(`/onboard/${payload.onboarding_application_id}`), 1200);
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

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Proposal from</p>
          <h1 className="text-3xl font-semibold">{quote.practice_name}</h1>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Proposal {quote.quote_number}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Prepared for {quote.recipient_name}</p>
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
                  {quote.lines.map((l, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-3 pr-2">{l.service_name}</td>
                      <td className="py-3 px-2 text-right">{Number(l.quantity)}</td>
                      <td className="py-3 px-2 text-right">{fmt(quote.currency, l.unit_price)}</td>
                      <td className="py-3 px-2 text-right capitalize">{l.billing_frequency === "monthly" ? "Monthly" : "One-off"}</td>
                      <td className="py-3 pl-2 text-right">{fmt(quote.currency, l.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {(() => {
                    const monthly = quote.lines
                      .filter((l) => l.billing_frequency === "monthly")
                      .reduce((s, l) => s + Number(l.subtotal || 0), 0);
                    const oneOff = quote.lines
                      .filter((l) => l.billing_frequency !== "monthly")
                      .reduce((s, l) => s + Number(l.subtotal || 0), 0);
                    return (
                      <>
                        {oneOff > 0 && (
                          <tr>
                            <td colSpan={4} className="pt-4 text-right font-semibold">Due Now</td>
                            <td className="pt-4 pl-2 text-right font-semibold">{fmt(quote.currency, oneOff)}</td>
                          </tr>
                        )}
                        {monthly > 0 && (
                          <tr>
                            <td colSpan={4} className="pt-2 text-right font-semibold">Monthly Recurring</td>
                            <td className="pt-2 pl-2 text-right font-semibold">
                              {fmt(quote.currency, monthly)}<span className="text-muted-foreground font-normal">/month</span>
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
                    <p>Proposal accepted. Continuing to your onboarding…</p>
                  </div>
                  {onboardingId && (
                    <Button onClick={() => navigate(`/onboard/${onboardingId}`)}>
                      Continue Onboarding
                    </Button>
                  )}
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
                Let {quote.practice_name} know why you're declining (optional).
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