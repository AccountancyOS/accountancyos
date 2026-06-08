import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BookkeepingEntity } from "./EntitySelector";
import { Check, MessageCircle, X, CheckCheck } from "lucide-react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  entity: BookkeepingEntity;
}

type ReviewRow = {
  id: string;
  kind: "invoice" | "bill" | "transaction" | "receipt" | "vat_return" | "query";
  title: string;
  subtitle: string;
  amount?: number | null;
  status: string;
  created_at: string;
};

const SECTIONS: { id: ReviewRow["kind"]; label: string; table: string; titleCol: string; subtitleCol: string; amountCol?: string }[] = [
  { id: "bill", label: "Bills Awaiting Review", table: "bills", titleCol: "bill_number", subtitleCol: "reference", amountCol: "total_gross" },
  { id: "transaction", label: "Transactions To Review", table: "bank_transactions", titleCol: "description", subtitleCol: "category", amountCol: "amount" },
  { id: "receipt", label: "Receipts Pending", table: "receipts", titleCol: "vendor_name", subtitleCol: "category", amountCol: "total_amount" },
  { id: "invoice", label: "Invoices Awaiting Send Approval", table: "invoices", titleCol: "invoice_number", subtitleCol: "contact_name", amountCol: "total_gross" },
  { id: "vat_return", label: "VAT Returns With Client", table: "vat_returns", titleCol: "period_end", subtitleCol: "status", amountCol: "box_5_net_vat" },
];

export function ReviewQueueTab({ entity }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const col = entity.type === "client" ? "client_id" : "company_id";
  const [answerOpen, setAnswerOpen] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["bk-review-queue", entity.type, entity.id],
    queryFn: async (): Promise<Record<string, ReviewRow[]>> => {
      const out: Record<string, ReviewRow[]> = {};
      for (const s of SECTIONS) {
        const { data, error } = await supabase
          .from(s.table as any)
          .select("*")
          .eq(col, entity.id)
          .eq("review_status", "pending_review")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) continue;
        out[s.id] = (data ?? []).map((r: any) => ({
          id: r.id,
          kind: s.id,
          title: String(r[s.titleCol] ?? "—"),
          subtitle: String(r[s.subtitleCol] ?? ""),
          amount: s.amountCol ? Number(r[s.amountCol] ?? 0) : undefined,
          status: r.status ?? r.review_status,
          created_at: r.created_at,
        }));
      }
      // Open queries
      const { data: queries } = await supabase
        .from("bookkeeping_queries" as any)
        .select("*")
        .eq(col, entity.id)
        .in("status", ["open", "answered"])
        .order("created_at", { ascending: false });
      out["query"] = (queries ?? []).map((q: any) => ({
        id: q.id,
        kind: "query",
        title: q.question?.slice(0, 80) ?? "Query",
        subtitle: `${q.object_type} · ${q.status}`,
        status: q.status,
        created_at: q.created_at,
      }));
      return out;
    },
    enabled: !!entity.id,
  });

  const action = useMutation({
    mutationFn: async (p: { kind: ReviewRow["kind"]; id: string; review_status: "approved" | "rejected" | "queried" }) => {
      const table = SECTIONS.find((s) => s.id === p.kind)?.table;
      if (!table) throw new Error("Unknown section");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from(table as any)
        .update({
          review_status: p.review_status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: u.user?.id,
          review_action: p.review_status,
        })
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bk-review-queue", entity.type, entity.id] });
      toast({ title: "Review Updated" });
    },
    onError: (e: any) => toast({ title: "Action Failed", description: e.message, variant: "destructive" }),
  });

  const queryAction = useMutation({
    mutationFn: async (p: { id: string; action: "answer" | "resolve"; response?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const patch: any =
        p.action === "answer"
          ? { status: "answered", response: p.response, answered_by: u.user?.id, answered_at: new Date().toISOString() }
          : { status: "resolved", resolved_by: u.user?.id, resolved_at: new Date().toISOString() };
      const { error } = await supabase.from("bookkeeping_queries" as any).update(patch).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bk-review-queue", entity.type, entity.id] });
      toast({ title: "Query Updated" });
      setAnswerOpen(null);
      setAnswerText("");
    },
    onError: (e: any) => toast({ title: "Action Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  const total = Object.values(rows ?? {}).reduce((a, b) => a + b.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Queue</CardTitle>
        <CardDescription>
          Client-originated activity awaiting your review. {total === 0 ? "All caught up." : `${total} item${total === 1 ? "" : "s"} pending.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="bill">
          <TabsList className="flex-wrap h-auto">
            {SECTIONS.map((s) => (
              <TabsTrigger key={s.id} value={s.id} className="text-xs">
                {s.label}
                {(rows?.[s.id]?.length ?? 0) > 0 && (
                  <Badge variant="secondary" className="ml-2">{rows![s.id].length}</Badge>
                )}
              </TabsTrigger>
            ))}
            <TabsTrigger value="query" className="text-xs">
              Open Queries
              {(rows?.query?.length ?? 0) > 0 && (
                <Badge variant="secondary" className="ml-2">{rows!.query.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {[...SECTIONS.map((s) => s.id), "query" as const].map((id) => (
            <TabsContent key={id} value={id} className="space-y-2 mt-4">
              {(rows?.[id] ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nothing to review.</p>
              ) : (
                rows![id].map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(r.created_at).toLocaleString()}
                      </p>
                    </div>
                    {r.amount !== undefined && (
                      <div className="text-sm font-medium tabular-nums">
                        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.amount ?? 0)}
                      </div>
                    )}
                    {id !== "query" ? (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => action.mutate({ kind: id as any, id: r.id, review_status: "approved" })}>
                          <Check className="h-4 w-4" /> Accept
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => action.mutate({ kind: id as any, id: r.id, review_status: "queried" })}>
                          <MessageCircle className="h-4 w-4" /> Query
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => action.mutate({ kind: id as any, id: r.id, review_status: "rejected" })}>
                          <X className="h-4 w-4" /> Reject
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-1 w-full max-w-xs">
                        {answerOpen === r.id ? (
                          <div className="w-full space-y-2">
                            <Textarea
                              rows={2}
                              value={answerText}
                              onChange={(e) => setAnswerText(e.target.value)}
                              placeholder="Type your answer for the client..."
                            />
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => { setAnswerOpen(null); setAnswerText(""); }}>Cancel</Button>
                              <Button size="sm" onClick={() => queryAction.mutate({ id: r.id, action: "answer", response: answerText })} disabled={!answerText.trim() || queryAction.isPending}>Send</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setAnswerOpen(r.id)}>
                              <MessageCircle className="h-4 w-4" /> Answer
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => queryAction.mutate({ id: r.id, action: "resolve" })} disabled={queryAction.isPending}>
                              <CheckCheck className="h-4 w-4" /> Resolve
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}