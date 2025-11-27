import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PortalLayout from "@/components/portal/PortalLayout";
import { usePortal } from "@/lib/portal-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Wallet, PiggyBank, Receipt, Building2, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import {
  calculateRevenue,
  calculateNetProfit,
  calculateCashAtBank,
  calculateVATPosition,
  getCTEstimate,
  getAgedReceivables,
  getAgedPayables,
  getRecentBankTransactions,
  getPeriodDates,
  type PeriodOption
} from "@/lib/bookkeeping-kpi";
import { usePortalVisibility } from "@/hooks/usePortalVisibility";

export default function PortalFinancials() {
  const { currentSpace } = usePortal();
  const [periodOption, setPeriodOption] = useState<PeriodOption>('last_12_months');
  const { start: periodStart, end: periodEnd } = getPeriodDates(periodOption);
  const { start: ytdStart, end: ytdEnd } = getPeriodDates('ytd');

  const entityType = currentSpace?.type || 'client';
  const entityId = currentSpace?.id || '';

  const { data: visibility, isLoading: loadingVisibility } = usePortalVisibility(entityType, entityId);

  // KPI Queries
  const { data: ytdRevenue, isLoading: loadingRevenue } = useQuery({
    queryKey: ['portal-revenue-ytd', entityType, entityId, ytdStart, ytdEnd],
    queryFn: () => calculateRevenue(entityType, entityId, ytdStart, ytdEnd),
    enabled: !!entityId && visibility?.showRevenue
  });

  const { data: ytdProfit, isLoading: loadingProfit } = useQuery({
    queryKey: ['portal-profit-ytd', entityType, entityId, ytdStart, ytdEnd],
    queryFn: () => calculateNetProfit(entityType, entityId, ytdStart, ytdEnd),
    enabled: !!entityId && visibility?.showProfit
  });

  const { data: cashAtBank, isLoading: loadingCash } = useQuery({
    queryKey: ['portal-cash', entityType, entityId],
    queryFn: () => calculateCashAtBank(entityType, entityId),
    enabled: !!entityId && visibility?.showCash
  });

  const { data: vatPosition, isLoading: loadingVAT } = useQuery({
    queryKey: ['portal-vat', entityType, entityId],
    queryFn: () => calculateVATPosition(entityType, entityId),
    enabled: !!entityId && visibility?.showVATPosition
  });

  const { data: ctEstimate, isLoading: loadingCT } = useQuery({
    queryKey: ['portal-ct', entityType, entityId],
    queryFn: () => getCTEstimate(entityType, entityId),
    enabled: !!entityId && visibility?.showCTEstimate
  });

  const { data: agedReceivables, isLoading: loadingAR } = useQuery({
    queryKey: ['portal-ar', entityType, entityId],
    queryFn: () => getAgedReceivables(entityType, entityId),
    enabled: !!entityId && visibility?.showReceivablesPayables
  });

  const { data: agedPayables, isLoading: loadingAP } = useQuery({
    queryKey: ['portal-ap', entityType, entityId],
    queryFn: () => getAgedPayables(entityType, entityId),
    enabled: !!entityId && visibility?.showReceivablesPayables
  });

  const { data: transactions, isLoading: loadingTransactions } = useQuery({
    queryKey: ['portal-transactions', entityType, entityId],
    queryFn: () => getRecentBankTransactions(entityType, entityId, 20),
    enabled: !!entityId && visibility?.showTransactions
  });

  if (!currentSpace) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No space selected</p>
        </div>
      </PortalLayout>
    );
  }

  const entityLabel = entityType === 'company' ? 'Business Overview' : 
    'Business Overview – Sole Trade';

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{entityLabel}</h1>
            <p className="text-muted-foreground">{currentSpace.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={periodOption} onValueChange={(v) => setPeriodOption(v as PeriodOption)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_12_months">Last 12 Months</SelectItem>
                <SelectItem value="ytd">This Year</SelectItem>
                <SelectItem value="current_quarter">This Quarter</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {visibility?.showRevenue && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Revenue (YTD)</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loadingRevenue ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold">{formatCurrency(ytdRevenue ?? 0)}</div>
                )}
              </CardContent>
            </Card>
          )}

          {visibility?.showProfit && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Net Profit (YTD)</CardTitle>
                <PiggyBank className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loadingProfit ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold">{formatCurrency(ytdProfit ?? 0)}</div>
                )}
              </CardContent>
            </Card>
          )}

          {visibility?.showCash && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cash at Bank</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loadingCash ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold">{formatCurrency(cashAtBank ?? 0)}</div>
                )}
              </CardContent>
            </Card>
          )}

          {visibility?.showVATPosition && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">VAT Due</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loadingVAT ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{formatCurrency(vatPosition?.amount ?? 0)}</div>
                    {vatPosition?.isEstimate && (
                      <p className="text-xs text-muted-foreground">Estimate</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {visibility?.showCTEstimate && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Corporation Tax</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loadingCT ? (
                  <Skeleton className="h-8 w-24" />
                ) : ctEstimate?.status === 'finalised' ? (
                  <div className="text-2xl font-bold">{formatCurrency(ctEstimate.amount ?? 0)}</div>
                ) : (
                  <div className="text-sm text-muted-foreground">Not yet finalised</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* AR/AP Summary */}
        {visibility?.showReceivablesPayables && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Aged Receivables</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingAR ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Current</span>
                      <span>{formatCurrency(agedReceivables?.current ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>1-30 days</span>
                      <span>{formatCurrency(agedReceivables?.days30 ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>31-60 days</span>
                      <span>{formatCurrency(agedReceivables?.days60 ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-destructive">
                      <span>90+ days</span>
                      <span>{formatCurrency(agedReceivables?.days90Plus ?? 0)}</span>
                    </div>
                    <div className="flex justify-between font-medium pt-2 border-t">
                      <span>Total</span>
                      <span>{formatCurrency(agedReceivables?.total ?? 0)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Aged Payables</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingAP ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Current</span>
                      <span>{formatCurrency(agedPayables?.current ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>1-30 days</span>
                      <span>{formatCurrency(agedPayables?.days30 ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>31-60 days</span>
                      <span>{formatCurrency(agedPayables?.days60 ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-destructive">
                      <span>90+ days</span>
                      <span>{formatCurrency(agedPayables?.days90Plus ?? 0)}</span>
                    </div>
                    <div className="flex justify-between font-medium pt-2 border-t">
                      <span>Total</span>
                      <span>{formatCurrency(agedPayables?.total ?? 0)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Recent Transactions */}
        {visibility?.showTransactions && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Transactions</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link to="/portal/messages">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Ask about these numbers
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {loadingTransactions ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : transactions && transactions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          {new Date(tx.date).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </TableCell>
                        <TableCell>{tx.description}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{tx.category}</Badge>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(tx.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No recent transactions</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PortalLayout>
  );
}
