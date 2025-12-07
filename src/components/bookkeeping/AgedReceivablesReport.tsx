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
import { getAgedReceivables } from "@/lib/invoice-service";

interface AgedReceivablesReportProps {
  entity: BookkeepingEntity;
}

interface CustomerAging {
  customerId: string;
  customerName: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
  invoices: any[];
  expanded?: boolean;
}

export function AgedReceivablesReport({ entity }: AgedReceivablesReportProps) {
  const { organization } = useOrganization();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);
  const [customerFilter, setCustomerFilter] = useState("all");
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  const { data: customers } = useQuery({
    queryKey: ["customers-for-report", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const query = supabase
        .from("customers")
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
    queryKey: ["aged-receivables-report", organization?.id, entity.type, entity.id, asOfDate, customerFilter],
    queryFn: async () => {
      if (!organization?.id) return null;

      const result = await getAgedReceivables(
        organization.id,
        entity.type,
        entity.id,
        asOfDate
      );

      // Group by customer
      const customerMap = new Map<string, CustomerAging>();
      const asOf = new Date(asOfDate);

      for (const inv of result.invoices || []) {
        const custId = inv.customer_id || "uncategorized";
        const custName = inv.customer?.name || inv.contact_name || "Uncategorized";

        if (customerFilter !== "all" && custId !== customerFilter) continue;

        if (!customerMap.has(custId)) {
          customerMap.set(custId, {
            customerId: custId,
            customerName: custName,
            current: 0,
            days1to30: 0,
            days31to60: 0,
            days61to90: 0,
            over90: 0,
            total: 0,
            invoices: [],
          });
        }

        const customer = customerMap.get(custId)!;
        const outstanding = Number(inv.total_gross) - Number(inv.amount_paid || 0);
        const dueDate = new Date(inv.due_date);
        const daysPastDue = Math.floor((asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysPastDue <= 0) {
          customer.current += outstanding;
        } else if (daysPastDue <= 30) {
          customer.days1to30 += outstanding;
        } else if (daysPastDue <= 60) {
          customer.days31to60 += outstanding;
        } else if (daysPastDue <= 90) {
          customer.days61to90 += outstanding;
        } else {
          customer.over90 += outstanding;
        }
        customer.total += outstanding;
        customer.invoices.push({ ...inv, outstanding, daysPastDue });
      }

      return {
        customers: Array.from(customerMap.values()).sort((a, b) => b.total - a.total),
        summary: result,
      };
    },
    enabled: !!organization?.id,
  });

  const toggleCustomer = (customerId: string) => {
    setExpandedCustomers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(customerId)) {
        newSet.delete(customerId);
      } else {
        newSet.add(customerId);
      }
      return newSet;
    });
  };

  const totals = agingData?.customers.reduce(
    (acc, c) => ({
      current: acc.current + c.current,
      days1to30: acc.days1to30 + c.days1to30,
      days31to60: acc.days31to60 + c.days31to60,
      days61to90: acc.days61to90 + c.days61to90,
      over90: acc.over90 + c.over90,
      total: acc.total + c.total,
    }),
    { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 }
  ) || { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Aged Receivables</h2>
          <p className="text-sm text-muted-foreground">
            Outstanding sales invoices by age bucket
          </p>
        </div>
        <Button variant="outline" disabled>
          <Download className="h-4 w-4 mr-2" />
          Export PDF
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
          <Label>Customer</Label>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
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
      ) : !agingData?.customers.length ? (
        <div className="flex items-center justify-center h-[200px] border border-dashed rounded-lg">
          <div className="text-center space-y-2">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-lg font-medium">No outstanding receivables</p>
            <p className="text-sm text-muted-foreground">
              All invoices are paid or none exist for this period
            </p>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">1-30</TableHead>
                <TableHead className="text-right">31-60</TableHead>
                <TableHead className="text-right">61-90</TableHead>
                <TableHead className="text-right">90+</TableHead>
                <TableHead className="text-right font-bold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agingData.customers.map((customer) => (
                <Collapsible key={customer.customerId} asChild>
                  <>
                    <CollapsibleTrigger asChild>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleCustomer(customer.customerId)}
                      >
                        <TableCell>
                          {expandedCustomers.has(customer.customerId) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{customer.customerName}</TableCell>
                        <TableCell className="text-right font-mono">
                          {customer.current > 0 ? formatCurrency(customer.current) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {customer.days1to30 > 0 ? formatCurrency(customer.days1to30) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {customer.days31to60 > 0 ? formatCurrency(customer.days31to60) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {customer.days61to90 > 0 ? formatCurrency(customer.days61to90) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-destructive">
                          {customer.over90 > 0 ? formatCurrency(customer.over90) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatCurrency(customer.total)}
                        </TableCell>
                      </TableRow>
                    </CollapsibleTrigger>
                    <CollapsibleContent asChild>
                      <>
                        {expandedCustomers.has(customer.customerId) &&
                          customer.invoices.map((inv) => (
                            <TableRow key={inv.id} className="bg-muted/30">
                              <TableCell></TableCell>
                              <TableCell className="pl-8">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-sm">{inv.invoice_number || inv.id.substring(0, 8)}</span>
                                  <span className="text-xs text-muted-foreground">
                                    Due: {format(new Date(inv.due_date), "dd/MM/yyyy")}
                                  </span>
                                  {inv.daysPastDue > 0 && (
                                    <Badge variant="destructive" className="text-xs">
                                      {inv.daysPastDue} days overdue
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell colSpan={5}></TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatCurrency(inv.outstanding)}
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
