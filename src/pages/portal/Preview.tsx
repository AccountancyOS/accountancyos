import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Wallet, PiggyBank, Receipt, Building2, AlertTriangle } from "lucide-react";
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
} from "@/lib/bookkeeping-kpi";
import { usePortalVisibility } from "@/hooks/usePortalVisibility";

export default function PortalPreview() {
  const { entityType, entityId } = useParams<{ entityType: 'client' | 'company'; entityId: string }>();
  
  const { start: ytdStart, end: ytdEnd } = getPeriodDates('ytd');

  // Fetch entity name
  const { data: entityData } = useQuery({
    queryKey: ['preview-entity', entityType, entityId],
    queryFn: async () => {
      if (entityType === 'company') {
        const { data } = await supabase
          .from('companies')
          .select('company_name')
          .eq('id', entityId)
          .single();
        return { name: data?.company_name || 'Unknown Company', type: 'company' };
      } else {
        const { data } = await supabase
          .from('clients')
          .select('first_name, last_name')
          .eq('id', entityId)
          .single();
        return { name: `${data?.first_name || ''} ${data?.last_name || ''}`.trim() || 'Unknown Client', type: 'client' };
      }
    },
    enabled: !!entityType && !!entityId
  });

  const { data: visibility } = usePortalVisibility(entityType as 'client' | 'company', entityId);

  // KPI Queries
  const { data: ytdRevenue, isLoading: loadingRevenue } = useQuery({
    queryKey: ['preview-revenue-ytd', entityType, entityId, ytdStart, ytdEnd],
    queryFn: () => calculateRevenue(entityType as 'client' | 'company', entityId!, ytdStart, ytdEnd),
    enabled: !!entityId && visibility?.showRevenue
  });

  const { data: ytdProfit, isLoading: loadingProfit } = useQuery({
    queryKey: ['preview-profit-ytd', entityType, entityId, ytdStart, ytdEnd],
    queryFn: () => calculateNetProfit(entityType as 'client' | 'company', entityId!, ytdStart, ytdEnd),
    enabled: !!entityId && visibility?.showProfit
  });

  const { data: cashAtBank, isLoading: loadingCash } = useQuery({
    queryKey: ['preview-cash', entityType, entityId],
    queryFn: () => calculateCashAtBank(entityType as 'client' | 'company', entityId!),
    enabled: !!entityId && visibility?.showCash
  });

  const { data: vatPosition, isLoading: loadingVAT } = useQuery({
    queryKey: ['preview-vat', entityType, entityId],
    queryFn: () => calculateVATPosition(entityType as 'client' | 'company', entityId!),
    enabled: !!entityId && visibility?.showVATPosition
  });

  const { data: ctEstimate, isLoading: loadingCT } = useQuery({
    queryKey: ['preview-ct', entityType, entityId],
    queryFn: () => getCTEstimate(entityType as 'client' | 'company', entityId!),
    enabled: !!entityId && visibility?.showCTEstimate
  });

  const { data: agedReceivables, isLoading: loadingAR } = useQuery({
    queryKey: ['preview-ar', entityType, entityId],
    queryFn: () => getAgedReceivables(entityType as 'client' | 'company', entityId!),
    enabled: !!entityId && visibility?.showReceivablesPayables
  });

  const { data: agedPayables, isLoading: loadingAP } = useQuery({
    queryKey: ['preview-ap', entityType, entityId],
    queryFn: () => getAgedPayables(entityType as 'client' | 'company', entityId!),
    enabled: !!entityId && visibility?.showReceivablesPayables
  });

  const { data: transactions, isLoading: loadingTransactions } = useQuery({
    queryKey: ['preview-transactions', entityType, entityId],
    queryFn: () => getRecentBankTransactions(entityType as 'client' | 'company', entityId!, 20),
    enabled: !!entityId && visibility?.showTransactions
  });

  if (!entityType || !entityId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Invalid preview parameters</p>
      </div>
    );
  }

  const entityLabel = entityType === 'company' ? 'Business Overview' : 'Business Overview – Sole Trade';

  return (
    <div className="min-h-screen bg-background">
      {/* Preview Banner */}
      <div className="bg-amber-500 text-amber-950 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        Viewing as client - Read Only Preview
      </div>

      {/* Simulated Portal Header */}
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">{entityData?.name || 'Loading...'}</h1>
            <p className="text-sm text-muted-foreground">Client Portal</p>
          </div>
          <Badge variant="outline">
            {entityType === 'company' ? 'Company' : 'Individual'}
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{entityLabel}</h2>
          <p className="text-muted-foreground">Year to Date</p>
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
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
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
      </main>
    </div>
  );
}
