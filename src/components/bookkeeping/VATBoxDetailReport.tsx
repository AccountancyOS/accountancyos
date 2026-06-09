import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, startOfQuarter, endOfQuarter, subQuarters } from "date-fns";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { downloadCsv } from "@/lib/csv-export";
import { ChevronDown, ChevronRight, Download } from "lucide-react";

interface Props {
  entity: BookkeepingEntity;
}

interface BoxTotals {
  box1: number;
  box2: number;
  box3: number;
  box4: number;
  box5: number;
  box6: number;
  box7: number;
  box8: number;
  box9: number;
}

interface CodeTxn {
  source_type: string;
  source_id: string;
  reference: string | null;
  date: string;
  net: number;
  vat: number;
  box: number;
}

interface CodeRow {
  code: string;
  description: string | null;
  rate: number | null;
  vat_type: string | null;
  net_total: number;
  vat_total: number;
  transactions: CodeTxn[];
}

interface DetailResponse {
  totals: BoxTotals;
  codes: CodeRow[];
}

const BOX_LABELS: Record<keyof BoxTotals, string> = {
  box1: "Box 1 — VAT due on sales",
  box2: "Box 2 — VAT due on EU acquisitions",
  box3: "Box 3 — Total VAT due",
  box4: "Box 4 — VAT reclaimed on purchases",
  box5: "Box 5 — Net VAT (Box 3 – Box 4)",
  box6: "Box 6 — Total sales ex VAT",
  box7: "Box 7 — Total purchases ex VAT",
  box8: "Box 8 — EU goods supplied ex VAT",
  box9: "Box 9 — EU acquisitions ex VAT",
};

export function VATBoxDetailReport({ entity }: Props) {
  const { organization } = useOrganization();
  const today = new Date();
  const lastQ = subQuarters(today, 1);
  const [from, setFrom] = useState(format(startOfQuarter(lastQ), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfQuarter(lastQ), "yyyy-MM-dd"));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ["vat-9box-detail", organization?.id, entity.type, entity.id, from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vat_9box_detail", {
        p_organization_id: organization!.id,
        p_client_id: entity.type === "client" ? entity.id : (null as unknown as string),
        p_company_id: entity.type === "company" ? entity.id : (null as unknown as string),
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return data as unknown as DetailResponse;
    },
    enabled: !!organization?.id,
  });

  const totals: BoxTotals =
    data?.totals ?? { box1: 0, box2: 0, box3: 0, box4: 0, box5: 0, box6: 0, box7: 0, box8: 0, box9: 0 };
  const codes: CodeRow[] = data?.codes ?? [];

  const toggle = (code: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  };

  const handleExport = () => {
    const headers = [
      "VAT Code",
      "Description",
      "Rate %",
      "Type",
      "Box",
      "Source Type",
      "Source ID",
      "Reference",
      "Date",
      "Net",
      "VAT",
    ];
    const rows: Array<Array<unknown>> = [];
    for (const c of codes) {
      rows.push([
        c.code,
        c.description ?? "",
        c.rate ?? "",
        c.vat_type ?? "",
        "",
        "",
        "",
        "",
        "",
        c.net_total,
        c.vat_total,
      ]);
      for (const t of c.transactions ?? []) {
        rows.push([
          c.code,
          "",
          "",
          "",
          t.box,
          t.source_type,
          t.source_id,
          t.reference ?? "",
          t.date,
          t.net,
          t.vat,
        ]);
      }
    }
    rows.push([]);
    (Object.keys(BOX_LABELS) as Array<keyof BoxTotals>).forEach((k) => {
      rows.push([BOX_LABELS[k], "", "", "", "", "", "", "", "", "", totals[k]]);
    });
    downloadCsv(`vat-9box-detail-${from}-to-${to}.csv`, headers, rows);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>VAT 9-Box Detail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button variant="outline" onClick={handleExport} disabled={!data}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-sm text-destructive">
              Failed to load VAT detail: {(error as Error).message}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(Object.keys(BOX_LABELS) as Array<keyof BoxTotals>).map((k) => (
              <div key={k} className="border rounded-md p-3">
                <div className="text-xs text-muted-foreground">{BOX_LABELS[k]}</div>
                <div className="text-lg font-semibold mt-1">{formatCurrency(totals[k] ?? 0)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per VAT Code Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">VAT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No VAT activity in this period
                  </TableCell>
                </TableRow>
              )}
              {codes.map((c) => {
                const isOpen = expanded.has(c.code);
                return (
                  <Fragment key={c.code}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggle(c.code)}
                    >
                      <TableCell>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{c.code}</TableCell>
                      <TableCell>{c.description ?? ""}</TableCell>
                      <TableCell className="text-right">
                        {c.rate != null ? `${c.rate}%` : ""}
                      </TableCell>
                      <TableCell>{c.vat_type ?? ""}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.net_total)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.vat_total)}</TableCell>
                    </TableRow>
                    {isOpen && (c.transactions?.length ?? 0) > 0 && (
                      <TableRow>
                        <TableCell />
                        <TableCell colSpan={6} className="bg-muted/30">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead>Reference</TableHead>
                                <TableHead className="text-right">Box</TableHead>
                                <TableHead className="text-right">Net</TableHead>
                                <TableHead className="text-right">VAT</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {c.transactions.map((t, idx) => (
                                <TableRow key={`${c.code}-${idx}`}>
                                  <TableCell>
                                    {t.date ? format(new Date(t.date), "dd MMM yyyy") : ""}
                                  </TableCell>
                                  <TableCell>{t.source_type}</TableCell>
                                  <TableCell>{t.reference ?? ""}</TableCell>
                                  <TableCell className="text-right">{t.box}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(t.net)}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(t.vat)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
