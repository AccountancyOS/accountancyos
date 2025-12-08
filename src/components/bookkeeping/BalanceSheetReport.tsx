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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, CheckCircle, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { format } from "date-fns";

interface BalanceSheetReportProps {
  entity: BookkeepingEntity;
}

interface AccountLine {
  code: string;
  name: string;
  balance: number;
}

interface ReportSection {
  title: string;
  accounts: AccountLine[];
  total: number;
}

export function BalanceSheetReport({ entity }: BalanceSheetReportProps) {
  const { organization } = useOrganization();
  const [asOfDate, setAsOfDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Fetch ledger entries and accounts
  const { data: reportData, isLoading } = useQuery({
    queryKey: ["balance-sheet-report", organization?.id, entity.type, entity.id, asOfDate],
    queryFn: async () => {
      if (!organization?.id) return null;

      // Fetch accounts
      const accountsQuery = supabase
        .from("bookkeeping_accounts")
        .select("id, code, name, account_type, account_subtype")
        .eq("organization_id", organization.id)
        .in("account_type", ["ASSET", "LIABILITY", "EQUITY"]);

      if (entity.type === "company") {
        accountsQuery.eq("company_id", entity.id);
      } else {
        accountsQuery.eq("client_id", entity.id);
      }

      const { data: accounts, error: accError } = await accountsQuery;
      if (accError) throw accError;

      // Fetch all ledger entries up to as-of date
      const entriesQuery = supabase
        .from("ledger_entries")
        .select("account_id, debit, credit")
        .eq("organization_id", organization.id)
        .lte("entry_date", asOfDate);

      if (entity.type === "company") {
        entriesQuery.eq("company_id", entity.id);
      } else {
        entriesQuery.eq("client_id", entity.id);
      }

      const { data: entries, error: entryError } = await entriesQuery;
      if (entryError) throw entryError;

      // Calculate balances per account
      const balances: Record<string, number> = {};
      entries?.forEach(e => {
        if (!balances[e.account_id]) balances[e.account_id] = 0;
        balances[e.account_id] += (e.debit || 0) - (e.credit || 0);
      });

      // Group accounts into sections
      const currentAssets: AccountLine[] = [];
      const fixedAssets: AccountLine[] = [];
      const currentLiabilities: AccountLine[] = [];
      const longTermLiabilities: AccountLine[] = [];
      const equityAccounts: AccountLine[] = [];

      accounts?.forEach(acc => {
        const balance = balances[acc.id] || 0;
        const line: AccountLine = {
          code: acc.code,
          name: acc.name,
          balance: acc.account_type === "ASSET" ? balance : -balance, // Liabilities & equity are credit-normal
        };

        if (acc.account_type === "ASSET") {
          if (acc.account_subtype?.toLowerCase().includes("fixed") || 
              acc.account_subtype?.toLowerCase().includes("non-current")) {
            fixedAssets.push(line);
          } else {
            currentAssets.push(line);
          }
        } else if (acc.account_type === "LIABILITY") {
          if (acc.account_subtype?.toLowerCase().includes("long") || 
              acc.account_subtype?.toLowerCase().includes("non-current")) {
            longTermLiabilities.push(line);
          } else {
            currentLiabilities.push(line);
          }
        } else if (acc.account_type === "EQUITY") {
          equityAccounts.push(line);
        }
      });

      // Calculate retained earnings from P&L accounts
      const plQuery = supabase
        .from("ledger_entries")
        .select("account_id, debit, credit, bookkeeping_accounts!inner(account_type)")
        .eq("organization_id", organization.id)
        .in("bookkeeping_accounts.account_type", ["INCOME", "EXPENSE"])
        .lte("entry_date", asOfDate);

      if (entity.type === "company") {
        plQuery.eq("company_id", entity.id);
      } else {
        plQuery.eq("client_id", entity.id);
      }

      const { data: plEntries } = await plQuery;
      
      let retainedEarnings = 0;
      plEntries?.forEach(e => {
        const acc = e.bookkeeping_accounts as any;
        if (acc?.account_type === "INCOME") {
          retainedEarnings += (e.credit || 0) - (e.debit || 0);
        } else {
          retainedEarnings -= (e.debit || 0) - (e.credit || 0);
        }
      });

      // Add retained earnings to equity
      if (retainedEarnings !== 0) {
        equityAccounts.push({
          code: "RE",
          name: "Retained Earnings (Current Period)",
          balance: retainedEarnings,
        });
      }

      // Sort by code
      [currentAssets, fixedAssets, currentLiabilities, longTermLiabilities, equityAccounts]
        .forEach(arr => arr.sort((a, b) => a.code.localeCompare(b.code)));

      const totalCurrentAssets = currentAssets.reduce((sum, a) => sum + a.balance, 0);
      const totalFixedAssets = fixedAssets.reduce((sum, a) => sum + a.balance, 0);
      const totalAssets = totalCurrentAssets + totalFixedAssets;
      
      const totalCurrentLiabilities = currentLiabilities.reduce((sum, a) => sum + a.balance, 0);
      const totalLongTermLiabilities = longTermLiabilities.reduce((sum, a) => sum + a.balance, 0);
      const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;
      
      const totalEquity = equityAccounts.reduce((sum, a) => sum + a.balance, 0);

      return {
        currentAssets: { title: "Current Assets", accounts: currentAssets, total: totalCurrentAssets },
        fixedAssets: { title: "Fixed Assets", accounts: fixedAssets, total: totalFixedAssets },
        totalAssets,
        currentLiabilities: { title: "Current Liabilities", accounts: currentLiabilities, total: totalCurrentLiabilities },
        longTermLiabilities: { title: "Long-Term Liabilities", accounts: longTermLiabilities, total: totalLongTermLiabilities },
        totalLiabilities,
        equity: { title: "Equity", accounts: equityAccounts, total: totalEquity },
        isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
        difference: totalAssets - (totalLiabilities + totalEquity),
      };
    },
    enabled: !!organization?.id,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Balance Sheet</h2>
          <p className="text-sm text-muted-foreground">
            {entity.displayName} - As of {format(new Date(asOfDate), "d MMMM yyyy")}
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
            className="w-[180px]"
          />
        </div>
        <div className="flex items-end">
          {reportData && (
            <Badge variant={reportData.isBalanced ? "default" : "destructive"} className="flex items-center gap-1">
              {reportData.isBalanced ? (
                <>
                  <CheckCircle className="h-3 w-3" />
                  Balanced
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3" />
                  Difference: {formatCurrency(reportData.difference)}
                </>
              )}
            </Badge>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(reportData?.totalAssets || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Liabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(reportData?.totalLiabilities || 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Equity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(reportData?.equity.total || 0)}
            </div>
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
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* ASSETS */}
              <TableRow className="bg-muted font-bold">
                <TableCell colSpan={3}>ASSETS</TableCell>
              </TableRow>

              {/* Current Assets */}
              {reportData?.currentAssets.accounts.length ? (
                <>
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={3}>Current Assets</TableCell>
                  </TableRow>
                  {reportData.currentAssets.accounts.map((acc) => (
                    <TableRow key={acc.code}>
                      <TableCell className="text-muted-foreground">{acc.code}</TableCell>
                      <TableCell className="pl-6">{acc.name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(acc.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell></TableCell>
                    <TableCell>Total Current Assets</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(reportData.currentAssets.total)}
                    </TableCell>
                  </TableRow>
                </>
              ) : null}

              {/* Fixed Assets */}
              {reportData?.fixedAssets.accounts.length ? (
                <>
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={3}>Fixed Assets</TableCell>
                  </TableRow>
                  {reportData.fixedAssets.accounts.map((acc) => (
                    <TableRow key={acc.code}>
                      <TableCell className="text-muted-foreground">{acc.code}</TableCell>
                      <TableCell className="pl-6">{acc.name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(acc.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell></TableCell>
                    <TableCell>Total Fixed Assets</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(reportData.fixedAssets.total)}
                    </TableCell>
                  </TableRow>
                </>
              ) : null}

              <TableRow className="bg-primary/5 font-bold">
                <TableCell></TableCell>
                <TableCell>TOTAL ASSETS</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(reportData?.totalAssets || 0)}
                </TableCell>
              </TableRow>

              {/* LIABILITIES */}
              <TableRow className="bg-muted font-bold">
                <TableCell colSpan={3}>LIABILITIES</TableCell>
              </TableRow>

              {/* Current Liabilities */}
              {reportData?.currentLiabilities.accounts.length ? (
                <>
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={3}>Current Liabilities</TableCell>
                  </TableRow>
                  {reportData.currentLiabilities.accounts.map((acc) => (
                    <TableRow key={acc.code}>
                      <TableCell className="text-muted-foreground">{acc.code}</TableCell>
                      <TableCell className="pl-6">{acc.name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(acc.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell></TableCell>
                    <TableCell>Total Current Liabilities</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(reportData.currentLiabilities.total)}
                    </TableCell>
                  </TableRow>
                </>
              ) : null}

              {/* Long-Term Liabilities */}
              {reportData?.longTermLiabilities.accounts.length ? (
                <>
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={3}>Long-Term Liabilities</TableCell>
                  </TableRow>
                  {reportData.longTermLiabilities.accounts.map((acc) => (
                    <TableRow key={acc.code}>
                      <TableCell className="text-muted-foreground">{acc.code}</TableCell>
                      <TableCell className="pl-6">{acc.name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(acc.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell></TableCell>
                    <TableCell>Total Long-Term Liabilities</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(reportData.longTermLiabilities.total)}
                    </TableCell>
                  </TableRow>
                </>
              ) : null}

              <TableRow className="font-bold">
                <TableCell></TableCell>
                <TableCell>TOTAL LIABILITIES</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(reportData?.totalLiabilities || 0)}
                </TableCell>
              </TableRow>

              {/* EQUITY */}
              <TableRow className="bg-muted font-bold">
                <TableCell colSpan={3}>EQUITY</TableCell>
              </TableRow>
              {reportData?.equity.accounts.map((acc) => (
                <TableRow key={acc.code}>
                  <TableCell className="text-muted-foreground">{acc.code}</TableCell>
                  <TableCell className="pl-6">{acc.name}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(acc.balance)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold">
                <TableCell></TableCell>
                <TableCell>TOTAL EQUITY</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(reportData?.equity.total || 0)}
                </TableCell>
              </TableRow>

              {/* Balance Check */}
              <TableRow className="bg-primary/5 font-bold text-lg">
                <TableCell></TableCell>
                <TableCell>TOTAL LIABILITIES + EQUITY</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency((reportData?.totalLiabilities || 0) + (reportData?.equity.total || 0))}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
