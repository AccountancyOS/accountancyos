import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { PortalDeadlineRow } from "../../services/portalDeadlinesService";

interface Props {
  title: string;
  emptyMessage: string;
  viewAllLabel: string;
  viewAllTo: string;
  loading: boolean;
  rows: PortalDeadlineRow[];
  dateField: "dueDate" | "paymentDate";
  showAmount?: boolean;
}

function daysFromToday(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatAmount(amount: number | null, currency: string): string {
  if (amount == null) return "Amount TBC";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `£${Math.round(amount).toLocaleString()}`;
  }
}

function relativePill(days: number | null) {
  if (days == null) return { label: "—", variant: "secondary" as const };
  if (days <= 0) return { label: "Due today", variant: "destructive" as const };
  if (days <= 7) return { label: `Due in ${days}d`, variant: "destructive" as const };
  if (days <= 30) return { label: `Due in ${days}d`, variant: "default" as const };
  return { label: `Due in ${days}d`, variant: "secondary" as const };
}

export function DeadlineListCard({
  title,
  emptyMessage,
  viewAllLabel,
  viewAllTo,
  loading,
  rows,
  dateField,
  showAmount = false,
}: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const iso = r[dateField];
              const days = daysFromToday(iso);
              const pill = relativePill(days);
              return (
                <li key={r.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground" title={iso ?? undefined}>
                      {formatDate(iso)}
                      {showAmount ? ` · ${formatAmount(r.amount, r.currency)}` : ""}
                    </p>
                  </div>
                  <Badge variant={pill.variant} className="whitespace-nowrap">
                    {pill.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
        <div className="pt-3">
          <Link
            to={viewAllTo}
            className="text-sm text-primary hover:underline focus:outline-none focus:underline"
          >
            {viewAllLabel} →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}