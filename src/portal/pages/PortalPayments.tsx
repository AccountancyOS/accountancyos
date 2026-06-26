import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";
import { usePortalPayments } from "../hooks/usePortalData";

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// An invoice is payable by the client once issued and not yet settled/void.
const PAYABLE = new Set(["SENT", "AWAITING_PAYMENT", "PART_PAID", "OVERDUE"]);

export default function PortalPayments() {
  const { data, isLoading, refetch } = usePortalPayments();
  const [searchParams, setSearchParams] = useSearchParams();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Handle the return from Stripe Checkout: verify the session and mark paid.
  useEffect(() => {
    const paidInvoice = searchParams.get("paid_invoice");
    const sessionId = searchParams.get("session_id");
    if (searchParams.get("pay_cancelled")) {
      toast.info("Payment cancelled.");
      const next = new URLSearchParams(searchParams);
      next.delete("pay_cancelled");
      setSearchParams(next, { replace: true });
      return;
    }
    if (!paidInvoice || !sessionId) return;
    let cancelled = false;
    (async () => {
      setVerifying(true);
      try {
        const { data: res, error } = await supabase.functions.invoke("portal-verify-invoice-payment", {
          body: { invoice_id: paidInvoice, session_id: sessionId },
        });
        if (cancelled) return;
        if (error || (res as { error?: string })?.error) {
          toast.error("Could not confirm your payment", {
            description: (res as { error?: string })?.error || error?.message,
          });
        } else if ((res as { paid?: boolean })?.paid) {
          toast.success("Payment received — thank you.");
          refetch();
        } else {
          toast.info("Payment not completed.");
        }
      } finally {
        if (!cancelled) {
          setVerifying(false);
          const next = new URLSearchParams(searchParams);
          next.delete("paid_invoice");
          next.delete("session_id");
          setSearchParams(next, { replace: true });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams, setSearchParams, refetch]);

  const handlePay = async (invoiceId: string) => {
    setPayingId(invoiceId);
    try {
      const { data: res, error } = await supabase.functions.invoke("portal-pay-invoice", {
        body: { invoice_id: invoiceId },
      });
      const payload = res as { url?: string; error?: string } | null;
      if (error || payload?.error || !payload?.url) {
        toast.error("Could not start payment", { description: payload?.error || error?.message });
        setPayingId(null);
        return;
      }
      // Same-tab redirect so Stripe returns to this portal surface to verify.
      window.location.href = payload.url;
    } catch (e) {
      toast.error("Could not start payment", { description: e instanceof Error ? e.message : undefined });
      setPayingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader title="Payments" description="Your invoices and payment history." />
      {verifying && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Confirming your payment…
        </div>
      )}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <PortalEmptyState
          icon={CreditCard}
          title="No Invoices Issued"
          description="Invoices from your accountant will appear here once issued."
        />
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {data.map((p) => {
              const payable = PAYABLE.has(String(p.status).toUpperCase()) && p.amount > 0;
              return (
                <div key={p.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.reference}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p.dueAt ? `Due ${new Date(p.dueAt).toLocaleDateString("en-GB")}` : "No Due Date"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</span>
                    <Badge variant="secondary" className="capitalize">{p.status.toLowerCase()}</Badge>
                    {payable && (
                      <Button size="sm" variant="outline" disabled={payingId === p.id}
                        onClick={() => handlePay(p.id)}>
                        {payingId === p.id
                          ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          : <ExternalLink className="h-4 w-4 mr-2" />}
                        Pay
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
