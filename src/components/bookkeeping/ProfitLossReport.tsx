import { useState, useMemo } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { downloadCsv } from "@/lib/csv-export";
import { format, subMonths, startOfMonth, endOfMonth, startOfYear, endOfYear, subYears } from "date-fns";

interface ProfitLossReportProps {
  entity: BookkeepingEntity;
}

type PeriodPreset = "current-month" | "last-month" | "ytd" | "last-year" | "custom";

interface AccountLine {
  code: string;
  name: string;
  amount: number;
  priorAmount?: number;
}

interface ReportSection {
  title: string;
  accounts: AccountLine[];
  total: number;
  priorTotal?: number;
}

export function ProfitLossReport({ entity }: ProfitLossReportProps) {
  const { organization } = useOrganization();
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("ytd");
  const [showComparison, setShowComparison] = useState(false);
  
  // Calculate date ranges based on preset
  const { startDate, endDate, priorStartDate, priorEndDate } = useMemo(() => {
    const now = new Date();
    let start: Date, end: Date, priorStart: Date, priorEnd: Date;
    
    switch (periodPreset) {
      case "current-month":
        start = startOfMonth(now);
        end = endOfMonth(now);
        priorStart = startOfMonth(subMonths(now, 1));
        priorEnd = endOfMonth(subMonths(now, 1));
        break;
      case "last-month":
        start = startOfMonth(subMonths(now, 1));
        end = endOfMonth(subMonths(now, 1));
        priorStart = startOfMonth(subMonths(now, 2));
        priorEnd = endOfMonth(subMonths(now, 2));
        break;
      case "ytd":
        start = startOfYear(now);
        end = now;
        priorStart = startOfYear(subYears(now, 1));
        priorEnd = subYears(now, 1);
        break;
      case "last-year":
        start = startOfYear(subYears(now, 1));
        end = endOfYear(subYears(now, 1));
        priorStart = startOfYear(subYears(now, 2));
        priorEnd = endOfYear(subYears(now, 2));
        break;
      default:
        start = startOfYear(now);
        end = now;
        priorStart = startOfYear(subYears(now, 1));
        priorEnd = subYears(now, 1);
    }
    
    return {
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
      priorStartDate: format(priorStart, "yyyy-MM-dd"),
      priorEndDate: format(priorEnd, "yyyy-MM-dd"),
    };
  }, [periodPreset]);

  // Fetch ledger entries and accounts
  const { data: reportData, isLoading } = useQuery({
    queryKey: ["pl-report", organization?.id, entity.type, entity.id, startDate, endDate, priorStartDate, priorEndDate, showComparison],
    queryFn: async () => {
      if (!organization?.id) return null;

      // Fetch accounts
      const accountsQuery = supabase
        .from("bookkeeping_accounts")
        .select("id, code, name, account_type, account_subtype")
        .eq("organization_id", organization.id)
        .in("account_type", ["INCOME", "EXPENSE"]);

      if (entity.type === "company") {
        accountsQuery.eq("company_id", entity.id);
      } else {
        accountsQuery.eq("client_id", entity.id);
      }

      const { data: accounts, error: accError } = await accountsQuery;
      if (accError) throw accError;

      // Fetch ledger entries for current period
      const entriesQuery = supabase
        .from("ledger_entries")
        .select("account_id, debit, credit")
        .eq("organization_id", organization.id)
        .gte("entry_date", startDate)
        .lte("entry_date", endDate);

      if (entity.type === "company") {
        entriesQuery.eq("company_id", entity.id);
      } else {
        entriesQuery.eq("client_id", entity.id);
      }

      const { data: entries, error: entryError } = await entriesQuery;
      if (entryError) throw entryError;

      // Fetch prior period entries if comparison enabled
      let priorEntries: any[] = [];
      if (showComparison) {
        const priorQuery = supabase
          .from("ledger_entries")
          .select("account_id, debit, credit")
          .eq("organization_id", organization.id)
          .gte("entry_date", priorStartDate)
          .lte("entry_date", priorEndDate);

        if (entity.type === "company") {
          priorQuery.eq("company_id", entity.id);
        } else {
          priorQuery.eq("client_id", entity.id);
        }

        const { data } = await priorQuery;
        priorEntries = data || [];
      }

      // Calculate balances per account
      const currentBalances: Record<string, number> = {};
      const priorBalances: Record<string, number> = {};

      entries?.forEach(e => {
        if (!currentBalances[e.account_id]) currentBalances[e.account_id] = 0;
        // For P&L: Income = credits - debits, Expense = debits - credits
        currentBalances[e.account_id] += (e.credit || 0) - (e.debit || 0);
      });

      priorEntries.forEach(e => {
        if (!priorBalances[e.account_id]) priorBalances[e.account_id] = 0;
        priorBalances[e.account_id] += (e.credit || 0) - (e.debit || 0);
      });

      // Group accounts into sections
      const incomeAccounts: AccountLine[] = [];
      const expenseAccounts: AccountLine[] = [];

      accounts?.forEach(acc => {
        const balance = currentBalances[acc.id] || 0;
        const priorBalance = priorBalances[acc.id] || 0;

        const line: AccountLine = {
          code: acc.code,
          name: acc.name,
          amount: acc.account_type === "INCOME" ? balance : -balance, // Flip expenses to positive
          priorAmount: showComparison ? (acc.account_type === "INCOME" ? priorBalance : -priorBalance) : undefined,
        };

        if (acc.account_type === "INCOME") {
          incomeAccounts.push(line);
        } else {
          expenseAccounts.push(line);
        }
      });

      // Sort by code
      incomeAccounts.sort((a, b) => a.code.localeCompare(b.code));
      expenseAccounts.sort((a, b) => a.code.localeCompare(b.code));

      const totalIncome = incomeAccounts.reduce((sum, a) => sum + a.amount, 0);
      const totalExpenses = expenseAccounts.reduce((sum, a) => sum + a.amount, 0);
      const priorIncome = incomeAccounts.reduce((sum, a) => sum + (a.priorAmount || 0), 0);
      const priorExpenses = expenseAccounts.reduce((sum, a) => sum + (a.priorAmount || 0), 0);

      return {
        revenue: {
          title: "Revenue",
          accounts: incomeAccounts,
          total: totalIncome,
          priorTotal: showComparison ? priorIncome : undefined,
        },
        expenses: {
          title: "Operating Expenses",
          accounts: expenseAccounts,
          total: totalExpenses,
          priorTotal: showComparison ? priorExpenses : undefined,
        },
        netProfit: totalIncome - totalExpenses,
        priorNetProfit: showComparison ? priorIncome - priorExpenses : undefined,
      };
    },
    enabled: !!organization?.id,
  });

  const periodLabel = useMemo(() => {
    switch (periodPreset) {
      case "current-month": return "Current Month";
      case "last-month": return "Last Month";
      case "ytd": return "Year to Date";
      case "last-year": return "Last Year";
      default: return "Custom Period";
    }
  }, [periodPreset]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Profit & Loss Statement</h2>
          <p className="text-sm text-muted-foreground">
            {entity.displayName} - {periodLabel}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!reportData}
          onClick={() => {
            if (!reportData) return;
            const headers = showComparison
              ? ["Section", "Code", "Account", "Amount", "Prior", "Variance"]
              : ["Section", "Code", "Account", "Amount"];
            const rows: Array<Array<unknown>> = [];
            for (const a of reportData.revenue.accounts) {
              rows.push(
                showComparison
                  ? ["Revenue", a.code, a.name, a.amount, a.priorAmount ?? 0, a.amount - (a.priorAmount ?? 0)]
                  : ["Revenue", a.code, a.name, a.amount],
              );
            }
            rows.push(
              showComparison
                ? ["Revenue", "", "Total Revenue", reportData.revenue.total, reportData.revenue.priorTotal ?? 0, (reportData.revenue.total) - (reportData.revenue.priorTotal ?? 0)]
                : ["Revenue", "", "Total Revenue", reportData.revenue.total],
            );
            for (const a of reportData.expenses.accounts) {
              rows.push(
                showComparison
                  ? ["Expenses", a.code, a.name, a.amount, a.priorAmount ?? 0, a.amount - (a.priorAmount ?? 0)]
                  : ["Expenses", a.code, a.name, a.amount],
              );
            }
            rows.push(
              showComparison
                ? ["Expenses", "", "Total Expenses", reportData.expenses.total, reportData.expenses.priorTotal ?? 0, (reportData.expenses.total) - (reportData.expenses.priorTotal ?? 0)]
                : ["Expenses", "", "Total Expenses", reportData.expenses.total],
            );
            rows.push(
              showComparison
                ? ["", "", "Net Profit", reportData.netProfit, reportData.priorNetProfit ?? 0, (reportData.netProfit) - (reportData.priorNetProfit ?? 0)]
                : ["", "", "Net Profit", reportData.netProfit],
            );
            downloadCsv(
              `profit-loss-${entity.displayName}-${startDate}-to-${endDate}.csv`,
              headers,
              rows,
            );
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 border rounded-lg bg-muted/30">
        <div className="space-y-1">
          <Label>Period</Label>
          <Select value={periodPreset} onValueChange={(v) => setPeriodPreset(v as PeriodPreset)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current-month">Current Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
              <SelectItem value="last-year">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            variant={showComparison ? "default" : "outline"}
            size="sm"
            onClick={() => setShowComparison(!showComparison)}
          >
            {showComparison ? "Hide Comparison" : "Show Comparison"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(reportData?.revenue.total || 0)}
            </div>
            {showComparison && reportData?.revenue.priorTotal !== undefined && (
              <p className="text-xs text-muted-foreground">
                Prior: {formatCurrency(reportData.revenue.priorTotal)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(reportData?.expenses.total || 0)}
            </div>
            {showComparison && reportData?.expenses.priorTotal !== undefined && (
              <p className="text-xs text-muted-foreground">
                Prior: {formatCurrency(reportData.expenses.priorTotal)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Net Profit
              {(reportData?.netProfit || 0) >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(reportData?.netProfit || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrency(reportData?.netProfit || 0)}
            </div>
            {showComparison && reportData?.priorNetProfit !== undefined && (
              <p className="text-xs text-muted-foreground">
                Prior: {formatCurrency(reportData.priorNetProfit)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Report Table */}
      {isLoading ? (
        <Skeleton className="h-[400px] w-full" />
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">{periodLabel}</TableHead>
                {showComparison && <TableHead className="text-right">Prior Period</TableHead>}
                {showComparison && <TableHead className="text-right">Variance</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Revenue Section */}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={showComparison ? 5 : 3}>Revenue</TableCell>
              </TableRow>
              {reportData?.revenue.accounts.map((acc) => (
                <TableRow key={acc.code}>
                  <TableCell className="text-muted-foreground">{acc.code}</TableCell>
                  <TableCell>{acc.name}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(acc.amount)}
                  </TableCell>
                  {showComparison && (
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatCurrency(acc.priorAmount || 0)}
                    </TableCell>
                  )}
                  {showComparison && (
                    <TableCell className="text-right font-mono">
                      <span className={acc.amount - (acc.priorAmount || 0) >= 0 ? "text-green-600" : "text-red-600"}>
                        {formatCurrency(acc.amount - (acc.priorAmount || 0))}
                      </span>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              <TableRow className="font-semibold border-t-2">
                <TableCell></TableCell>
                <TableCell>Total Revenue</TableCell>
                <TableCell className="text-right font-mono text-green-600">
                  {formatCurrency(reportData?.revenue.total || 0)}
                </TableCell>
                {showComparison && (
                  <TableCell className="text-right font-mono">
                    {formatCurrency(reportData?.revenue.priorTotal || 0)}
                  </TableCell>
                )}
                {showComparison && <TableCell></TableCell>}
              </TableRow>

              {/* Expenses Section */}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={showComparison ? 5 : 3}>Operating Expenses</TableCell>
              </TableRow>
              {reportData?.expenses.accounts.map((acc) => (
                <TableRow key={acc.code}>
                  <TableCell className="text-muted-foreground">{acc.code}</TableCell>
                  <TableCell>{acc.name}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(acc.amount)}
                  </TableCell>
                  {showComparison && (
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatCurrency(acc.priorAmount || 0)}
                    </TableCell>
                  )}
                  {showComparison && (
                    <TableCell className="text-right font-mono">
                      <span className={(acc.priorAmount || 0) - acc.amount >= 0 ? "text-green-600" : "text-red-600"}>
                        {formatCurrency((acc.priorAmount || 0) - acc.amount)}
                      </span>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              <TableRow className="font-semibold border-t-2">
                <TableCell></TableCell>
                <TableCell>Total Expenses</TableCell>
                <TableCell className="text-right font-mono text-red-600">
                  {formatCurrency(reportData?.expenses.total || 0)}
                </TableCell>
                {showComparison && (
                  <TableCell className="text-right font-mono">
                    {formatCurrency(reportData?.expenses.priorTotal || 0)}
                  </TableCell>
                )}
                {showComparison && <TableCell></TableCell>}
              </TableRow>

              {/* Net Profit */}
              <TableRow className="bg-primary/5 font-bold text-lg">
                <TableCell></TableCell>
                <TableCell>Net Profit</TableCell>
                <TableCell className={`text-right font-mono ${(reportData?.netProfit || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(reportData?.netProfit || 0)}
                </TableCell>
                {showComparison && (
                  <TableCell className="text-right font-mono">
                    {formatCurrency(reportData?.priorNetProfit || 0)}
                  </TableCell>
                )}
                {showComparison && (
                  <TableCell className="text-right font-mono">
                    <span className={(reportData?.netProfit || 0) - (reportData?.priorNetProfit || 0) >= 0 ? "text-green-600" : "text-red-600"}>
                      {formatCurrency((reportData?.netProfit || 0) - (reportData?.priorNetProfit || 0))}
                    </span>
                  </TableCell>
                )}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
