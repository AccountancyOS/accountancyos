import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { ChevronDown, ChevronRight, FileText, Download } from "lucide-react";
import { downloadCsv } from "@/lib/csv-export";
import { getAgedPayables } from "@/lib/bills-service";

interface AgedPayablesReportProps {
  entity: BookkeepingEntity;
}

interface SupplierAging {
  supplierId: string;
  supplierName: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
  bills: any[];
}

export function AgedPayablesReport({ entity }: AgedPayablesReportProps) {
  const { organization } = useOrganization();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-for-report", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const query = supabase
        .from("suppliers")
        .select("id, name")
        .eq("organization_id", organization.id)
        .eq("is_active", true);

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data } = await query.order("name");
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const { data: agingData, isLoading } = useQuery({
    queryKey: ["aged-payables-report", organization?.id, entity.type, entity.id, asOfDate, supplierFilter],
    queryFn: async () => {
      if (!organization?.id) return null;

      const result = await getAgedPayables(
        organization.id,
        entity.type,
        entity.id,
        asOfDate
      );

      // Group by supplier
      const supplierMap = new Map<string, SupplierAging>();
      const asOf = new Date(asOfDate);

      for (const bill of result.bills || []) {
        const suppId = bill.supplier_id || "uncategorized";
        const suppName = bill.supplier?.name || "Uncategorized";

        if (supplierFilter !== "all" && suppId !== supplierFilter) continue;

        if (!supplierMap.has(suppId)) {
          supplierMap.set(suppId, {
            supplierId: suppId,
            supplierName: suppName,
            current: 0,
            days1to30: 0,
            days31to60: 0,
            days61to90: 0,
            over90: 0,
            total: 0,
            bills: [],
          });
        }

        const supplier = supplierMap.get(suppId)!;
        const outstanding = Number(bill.total_gross) - Number(bill.amount_paid || 0);
        const dueDate = new Date(bill.due_date);
        const daysPastDue = Math.floor((asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysPastDue <= 0) {
          supplier.current += outstanding;
        } else if (daysPastDue <= 30) {
          supplier.days1to30 += outstanding;
        } else if (daysPastDue <= 60) {
          supplier.days31to60 += outstanding;
        } else if (daysPastDue <= 90) {
          supplier.days61to90 += outstanding;
        } else {
          supplier.over90 += outstanding;
        }
        supplier.total += outstanding;
        supplier.bills.push({ ...bill, outstanding, daysPastDue });
      }

      return {
        suppliers: Array.from(supplierMap.values()).sort((a, b) => b.total - a.total),
        summary: result,
      };
    },
    enabled: !!organization?.id,
  });

  const toggleSupplier = (supplierId: string) => {
    setExpandedSuppliers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(supplierId)) {
        newSet.delete(supplierId);
      } else {
        newSet.add(supplierId);
      }
      return newSet;
    });
  };

  const totals = agingData?.suppliers.reduce(
    (acc, s) => ({
      current: acc.current + s.current,
      days1to30: acc.days1to30 + s.days1to30,
      days31to60: acc.days31to60 + s.days31to60,
      days61to90: acc.days61to90 + s.days61to90,
      over90: acc.over90 + s.over90,
      total: acc.total + s.total,
    }),
    { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 }
  ) || { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Aged Payables</h2>
          <p className="text-sm text-muted-foreground">
            Outstanding purchase bills by age bucket
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!agingData || agingData.suppliers.length === 0}
          onClick={() => {
            if (!agingData) return;
            const headers = ["Supplier", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days", "Total"];
            const rows = agingData.suppliers.map((s) => [
              s.supplierName,
              s.current,
              s.days1to30,
              s.days31to60,
              s.days61to90,
              s.over90,
              s.total,
            ]);
            rows.push(["TOTAL", totals.current, totals.days1to30, totals.days31to60, totals.days61to90, totals.over90, totals.total]);
            downloadCsv(`aged-payables-${entity.displayName}-${asOfDate}.csv`, headers, rows);
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 border rounded-lg bg-muted/30">
        <div className="space-y-1">
          <Label>As of Date</Label>
          <Input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div className="space-y-1">
          <Label>Supplier</Label>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Current</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(totals.current)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">1-30 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(totals.days1to30)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">31-60 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(totals.days31to60)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">61-90 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(totals.days61to90)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-destructive">90+ Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-destructive">{formatCurrency(totals.over90)}</div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(totals.total)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Report Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-[200px]">
          <p>Loading report...</p>
        </div>
      ) : !agingData?.suppliers.length ? (
        <div className="flex items-center justify-center h-[200px] border border-dashed rounded-lg">
          <div className="text-center space-y-2">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-lg font-medium">No outstanding payables</p>
            <p className="text-sm text-muted-foreground">
              All bills are paid or none exist for this period
            </p>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">1-30</TableHead>
                <TableHead className="text-right">31-60</TableHead>
                <TableHead className="text-right">61-90</TableHead>
                <TableHead className="text-right">90+</TableHead>
                <TableHead className="text-right font-bold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agingData.suppliers.map((supplier) => (
                <Collapsible key={supplier.supplierId} asChild>
                  <>
                    <CollapsibleTrigger asChild>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleSupplier(supplier.supplierId)}
                      >
                        <TableCell>
                          {expandedSuppliers.has(supplier.supplierId) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{supplier.supplierName}</TableCell>
                        <TableCell className="text-right font-mono">
                          {supplier.current > 0 ? formatCurrency(supplier.current) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {supplier.days1to30 > 0 ? formatCurrency(supplier.days1to30) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {supplier.days31to60 > 0 ? formatCurrency(supplier.days31to60) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {supplier.days61to90 > 0 ? formatCurrency(supplier.days61to90) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-destructive">
                          {supplier.over90 > 0 ? formatCurrency(supplier.over90) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatCurrency(supplier.total)}
                        </TableCell>
                      </TableRow>
                    </CollapsibleTrigger>
                    <CollapsibleContent asChild>
                      <>
                        {expandedSuppliers.has(supplier.supplierId) &&
                          supplier.bills.map((bill) => (
                            <TableRow key={bill.id} className="bg-muted/30">
                              <TableCell></TableCell>
                              <TableCell className="pl-8">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-sm">{bill.bill_number || bill.id.substring(0, 8)}</span>
                                  <span className="text-xs text-muted-foreground">
                                    Due: {format(new Date(bill.due_date), "dd/MM/yyyy")}
                                  </span>
                                  {bill.daysPastDue > 0 && (
                                    <Badge variant="destructive" className="text-xs">
                                      {bill.daysPastDue} days overdue
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell colSpan={5}></TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatCurrency(bill.outstanding)}
                              </TableCell>
                            </TableRow>
                          ))}
                      </>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              ))}
              {/* Totals Row */}
              <TableRow className="bg-muted font-bold">
                <TableCell></TableCell>
                <TableCell>TOTAL</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totals.current)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totals.days1to30)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totals.days31to60)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totals.days61to90)}</TableCell>
                <TableCell className="text-right font-mono text-destructive">{formatCurrency(totals.over90)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totals.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
