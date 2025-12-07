import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  Wallet, 
  PiggyBank, 
  Receipt, 
  Building2, 
  AlertTriangle,
  Clock,
  ArrowRight,
  Eye,
  BanknoteIcon,
  FileText
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import {
  calculateRevenue,
  calculateNetProfit,
  calculateCashAtBank,
  calculateVATPosition,
  getCTEstimate,
  getUnreconciledCount,
  getAgedReceivables,
  getAgedPayables,
  getEntityDeadlinesAndJobs,
  getPeriodDates,
  type PeriodOption,
  type EntityFinancialDates
} from "@/lib/bookkeeping-kpi";
import { usePortalVisibility } from "@/hooks/usePortalVisibility";
import type { BookkeepingEntity } from "./EntitySelector";
import { supabase } from "@/integrations/supabase/client";

interface BusinessOverviewTabProps {
  entity: BookkeepingEntity;
  onTabChange?: (tab: string) => void;
}

export function BusinessOverviewTab({ entity, onTabChange }: BusinessOverviewTabProps) {
  const navigate = useNavigate();
  const [periodOption, setPeriodOption] = useState<PeriodOption>('current_month');

  const entityType = entity.type;
  const entityId = entity.id;

  // Fetch entity financial dates (year-end) from companies table
  const { data: entityFinancialDates } = useQuery({
    queryKey: ['entity-financial-dates', entityType, entityId],
    queryFn: async (): Promise<EntityFinancialDates> => {
      if (entityType === 'company') {
        const { data } = await supabase
          .from('companies')
          .select('year_end_month, year_end_day')
          .eq('id', entityId)
          .maybeSingle();
        return {
          yearEndMonth: data?.year_end_month || undefined,
          yearEndDay: data?.year_end_day || undefined
        };
      }
      // For clients (individuals), default to tax year (5 April)
      return { yearEndMonth: 4, yearEndDay: 5 };
    },
    enabled: !!entityId
  });

  const { start: periodStart, end: periodEnd } = getPeriodDates(periodOption, entityFinancialDates);
  const { start: ytdStart, end: ytdEnd } = getPeriodDates('ytd', entityFinancialDates);

  const { data: visibility } = usePortalVisibility(entityType, entityId);

  // KPI Queries
  const { data: periodRevenue, isLoading: loadingPeriodRevenue } = useQuery({
    queryKey: ['kpi-revenue-period', entityType, entityId, periodStart, periodEnd],
    queryFn: () => calculateRevenue(entityType, entityId, periodStart, periodEnd),
    enabled: !!entityId
  });

  const { data: ytdRevenue, isLoading: loadingYtdRevenue } = useQuery({
    queryKey: ['kpi-revenue-ytd', entityType, entityId, ytdStart, ytdEnd],
    queryFn: () => calculateRevenue(entityType, entityId, ytdStart, ytdEnd),
    enabled: !!entityId
  });

  const { data: periodProfit, isLoading: loadingPeriodProfit } = useQuery({
    queryKey: ['kpi-profit-period', entityType, entityId, periodStart, periodEnd],
    queryFn: () => calculateNetProfit(entityType, entityId, periodStart, periodEnd),
    enabled: !!entityId
  });

  const { data: ytdProfit, isLoading: loadingYtdProfit } = useQuery({
    queryKey: ['kpi-profit-ytd', entityType, entityId, ytdStart, ytdEnd],
    queryFn: () => calculateNetProfit(entityType, entityId, ytdStart, ytdEnd),
    enabled: !!entityId
  });

  const { data: cashAtBank, isLoading: loadingCash } = useQuery({
    queryKey: ['kpi-cash', entityType, entityId],
    queryFn: () => calculateCashAtBank(entityType, entityId),
    enabled: !!entityId
  });

  const { data: vatPosition, isLoading: loadingVAT } = useQuery({
    queryKey: ['kpi-vat', entityType, entityId],
    queryFn: () => calculateVATPosition(entityType, entityId),
    enabled: !!entityId
  });

  const { data: ctEstimate, isLoading: loadingCT } = useQuery({
    queryKey: ['kpi-ct', entityType, entityId],
    queryFn: () => getCTEstimate(entityType, entityId),
    enabled: !!entityId
  });

  const { data: unreconciledCount, isLoading: loadingUnreconciled } = useQuery({
    queryKey: ['kpi-unreconciled', entityType, entityId],
    queryFn: () => getUnreconciledCount(entityType, entityId),
    enabled: !!entityId
  });

  const { data: agedReceivables, isLoading: loadingAR } = useQuery({
    queryKey: ['kpi-ar', entityType, entityId],
    queryFn: () => getAgedReceivables(entityType, entityId),
    enabled: !!entityId
  });

  const { data: agedPayables, isLoading: loadingAP } = useQuery({
    queryKey: ['kpi-ap', entityType, entityId],
    queryFn: () => getAgedPayables(entityType, entityId),
    enabled: !!entityId
  });

  const { data: deadlinesAndJobs, isLoading: loadingDeadlines } = useQuery({
    queryKey: ['kpi-deadlines-jobs', entityType, entityId],
    queryFn: () => getEntityDeadlinesAndJobs(entityType, entityId),
    enabled: !!entityId
  });

  const handleViewAsClient = () => {
    navigate(`/portal/preview/${entityType}/${entityId}`);
  };

  const KPICard = ({ 
    title, 
    periodValue, 
    ytdValue, 
    icon: Icon, 
    loading,
    format = 'currency',
    showYTD = true
  }: { 
    title: string; 
    periodValue: number | null | undefined; 
    ytdValue?: number | null | undefined;
    icon: any; 
    loading: boolean;
    format?: 'currency' | 'number';
    showYTD?: boolean;
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-2xl font-bold">
              {format === 'currency' ? formatCurrency(periodValue ?? 0) : (periodValue ?? 0)}
            </div>
            {showYTD && ytdValue !== undefined && (
              <p className="text-xs text-muted-foreground">
                YTD: {format === 'currency' ? formatCurrency(ytdValue ?? 0) : (ytdValue ?? 0)}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">{entity.displayName}</h2>
          <Badge variant="outline">{entity.type === 'company' ? 'Company' : 'Individual'}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <Select value={periodOption} onValueChange={(v) => setPeriodOption(v as PeriodOption)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_month">Current Month</SelectItem>
              <SelectItem value="current_quarter">Current Quarter</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
              <SelectItem value="last_12_months">Last 12 Months</SelectItem>
              <SelectItem value="last_financial_quarter">Last Financial Quarter</SelectItem>
              <SelectItem value="last_financial_year">Last Financial Year</SelectItem>
              {entityType === 'client' && (
                <SelectItem value="tax_year">Tax Year</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleViewAsClient}>
            <Eye className="mr-2 h-4 w-4" />
            View as Client
          </Button>
        </div>
      </div>

      {/* Client Visibility Indicator */}
      {visibility && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Eye className="h-3 w-3" />
          <span>Client can see: </span>
          {visibility.showRevenue && <Badge variant="secondary" className="text-xs">Revenue</Badge>}
          {visibility.showProfit && <Badge variant="secondary" className="text-xs">Profit</Badge>}
          {visibility.showCash && <Badge variant="secondary" className="text-xs">Cash</Badge>}
          {visibility.showVATPosition && <Badge variant="secondary" className="text-xs">VAT</Badge>}
          {visibility.showCTEstimate && <Badge variant="secondary" className="text-xs">CT</Badge>}
          {visibility.showTransactions && <Badge variant="secondary" className="text-xs">Transactions</Badge>}
        </div>
      )}

      {/* Top KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KPICard
          title="Revenue"
          periodValue={periodRevenue}
          ytdValue={ytdRevenue}
          icon={TrendingUp}
          loading={loadingPeriodRevenue || loadingYtdRevenue}
        />
        <KPICard
          title="Net Profit"
          periodValue={periodProfit}
          ytdValue={ytdProfit}
          icon={PiggyBank}
          loading={loadingPeriodProfit || loadingYtdProfit}
        />
        <KPICard
          title="Cash at Bank"
          periodValue={cashAtBank}
          icon={Wallet}
          loading={loadingCash}
          showYTD={false}
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">VAT Position</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingVAT ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(vatPosition?.amount ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {vatPosition?.isEstimate ? 'Estimate' : 'From VAT Return'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CT Estimate</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingCT ? (
              <Skeleton className="h-8 w-24" />
            ) : ctEstimate?.status === 'finalised' ? (
              <div className="text-2xl font-bold">
                {formatCurrency(ctEstimate.amount ?? 0)}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Not yet calculated</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Overdue KPIs */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card 
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => onTabChange?.('sales')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Receivables</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {loadingAR ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-destructive">
                  {formatCurrency(
                    (agedReceivables?.days30 || 0) + 
                    (agedReceivables?.days60 || 0) + 
                    (agedReceivables?.days90Plus || 0)
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Click to view overdue invoices
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card 
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => onTabChange?.('bills')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Payables</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {loadingAP ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-destructive">
                  {formatCurrency(
                    (agedPayables?.days30 || 0) + 
                    (agedPayables?.days60 || 0) + 
                    (agedPayables?.days90Plus || 0)
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Click to view overdue bills
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary Panels */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Bank Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BanknoteIcon className="h-4 w-4" />
              Bank Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingUnreconciled ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Unreconciled transactions</span>
                  <Badge variant={unreconciledCount && unreconciledCount > 0 ? "destructive" : "secondary"}>
                    {unreconciledCount || 0}
                  </Badge>
                </div>
                {unreconciledCount && unreconciledCount > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => onTabChange?.('bank-reconciliation')}
                  >
                    Reconcile now
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Aged Receivables/Payables */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Aged AR/AP
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAR || loadingAP ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Receivables</span>
                  <span className="font-medium">{formatCurrency(agedReceivables?.total ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Payables</span>
                  <span className="font-medium">{formatCurrency(agedPayables?.total ?? 0)}</span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => onTabChange?.('sales')}
                  >
                    Receivables
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => onTabChange?.('bills')}
                  >
                    Payables
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deadlines & Jobs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Deadlines & Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingDeadlines ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-2">
                {deadlinesAndJobs?.deadlines.slice(0, 3).map((deadline) => (
                  <div key={deadline.id} className="flex items-center justify-between text-sm">
                    <span className="truncate flex-1">{deadline.name}</span>
                    <Badge variant="outline" className="ml-2">
                      {new Date(deadline.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </Badge>
                  </div>
                ))}
                {deadlinesAndJobs?.jobs.slice(0, 2).map((job) => (
                  <div key={job.id} className="flex items-center justify-between text-sm">
                    <span className="truncate flex-1">{job.job_name}</span>
                    <Badge variant="secondary" className="ml-2">{job.status.replace('_', ' ')}</Badge>
                  </div>
                ))}
                {(!deadlinesAndJobs?.deadlines.length && !deadlinesAndJobs?.jobs.length) && (
                  <p className="text-sm text-muted-foreground">No upcoming deadlines or active jobs</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alerts Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {unreconciledCount && unreconciledCount > 10 && (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                <span>{unreconciledCount} unreconciled bank transactions</span>
              </div>
            )}
            {agedReceivables && agedReceivables.days90Plus > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                <span>{formatCurrency(agedReceivables.days90Plus)} receivables overdue 90+ days</span>
              </div>
            )}
            {!unreconciledCount && !agedReceivables?.days90Plus && (
              <p className="text-sm text-muted-foreground">No alerts</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
