import { CreditCard, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";
import { usePortalPayments } from "../hooks/usePortalData";

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export default function PortalPayments() {
  const { data, isLoading } = usePortalPayments();

  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader title="Payments" description="Your invoices and payment history." />
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
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
            {data.map((p) => (
              <div key={p.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.reference}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {p.dueAt
                      ? `Due ${new Date(p.dueAt).toLocaleDateString("en-GB")}`
                      : "No Due Date"}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-medium tabular-nums">
                    {formatMoney(p.amount, p.currency)}
                  </span>
                  <Badge variant="secondary" className="capitalize">
                    {p.status.toLowerCase()}
                  </Badge>
                  {p.payUrl ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(p.payUrl!, "_blank", "noopener")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Pay
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}