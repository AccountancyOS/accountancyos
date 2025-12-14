import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { 
  RefreshCw, FileText, ChevronDown, ChevronRight, 
  AlertTriangle, CheckCircle, XCircle, Send, Calculator, Shield
} from "lucide-react";
import { toast } from "sonner";
import { generateVATPeriod, validateVATPeriod, finaliseVATPeriod } from "@/lib/vat-period-generator";
import type { VATReportModel, VATPeriodValidation } from "@/lib/vat-period-generator";
import { VATReconciliationPanel } from "./VATReconciliationPanel";
import { getReconciliation, type VATReconciliationResult } from "@/lib/vat-reconciliation-service";

interface VATPeriodsTabProps {
  entityId: string;
  entityType: 'company' | 'client';
  vrn?: string;
}

export function VATPeriodsTab({ entityId, entityType, vrn }: VATPeriodsTabProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState<any>(null);
  const [reportModel, setReportModel] = useState<VATReportModel | null>(null);
  const [validation, setValidation] = useState<VATPeriodValidation | null>(null);
  const [expandedBoxes, setExpandedBoxes] = useState<Set<number>>(new Set());
  const [reconciliation, setReconciliation] = useState<VATReconciliationResult | null>(null);

  const entityFilter = entityType === 'company' 
    ? { company_id: entityId }
    : { client_id: entityId };

  // Fetch VAT periods
  const { data: periods, isLoading } = useQuery({
    queryKey: ['vat-periods', organization?.id, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vat_periods')
        .select('*')
        .eq('organization_id', organization?.id)
        .match(entityFilter)
        .order('period_end', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  // Fetch VAT obligations (if available)
  const { data: obligations } = useQuery({
    queryKey: ['vat-obligations', organization?.id, vrn],
    queryFn: async () => {
      if (!vrn) return [];
      const { data, error } = await supabase
        .from('vat_obligations')
        .select('*')
        .eq('organization_id', organization?.id)
        .eq('vrn', vrn)
        .order('period_end', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id && !!vrn,
  });

  // Generate VAT period mutation
  const generateMutation = useMutation({
    mutationFn: async (params: { periodStart: string; periodEnd: string; periodKey?: string }) => {
      if (!organization?.id || !vrn) throw new Error('Missing organization or VRN');
      
      const report = await generateVATPeriod(
        organization.id,
        entityId,
        entityType,
        params.periodStart,
        params.periodEnd,
        vrn,
        params.periodKey || ''
      );
      
      const validationResult = await validateVATPeriod(report);
      
      return { report, validation: validationResult };
    },
    onSuccess: async ({ report, validation }) => {
      setReportModel(report);
      setValidation(validation);
      
      // Fetch reconciliation for this period
      if (report.period_id) {
        const recon = await getReconciliation(report.period_id);
        setReconciliation(recon);
      }
      
      queryClient.invalidateQueries({ queryKey: ['vat-periods'] });
      toast.success('VAT period calculated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to generate VAT period: ${error.message}`);
    },
  });

  // Finalise mutation
  const finaliseMutation = useMutation({
    mutationFn: async (periodId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      await finaliseVATPeriod(periodId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-periods'] });
      toast.success('VAT period finalised');
      setSelectedPeriod(null);
      setReportModel(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to finalise: ${error.message}`);
    },
  });

  const toggleBoxExpand = (boxNum: number) => {
    const next = new Set(expandedBoxes);
    if (next.has(boxNum)) {
      next.delete(boxNum);
    } else {
      next.add(boxNum);
    }
    setExpandedBoxes(next);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <Badge variant="outline">Open</Badge>;
      case 'CALCULATING':
        return <Badge variant="secondary">Calculating</Badge>;
      case 'READY_FOR_REVIEW':
        return <Badge className="bg-amber-500">Review</Badge>;
      case 'FINALISED':
        return <Badge className="bg-blue-500">Finalised</Badge>;
      case 'FILED':
        return <Badge className="bg-green-500">Filed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getReconciliationBadge = (status: string) => {
    switch (status) {
      case 'MATCHED':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Matched</Badge>;
      case 'WARNING':
        return <Badge className="bg-amber-500"><AlertTriangle className="w-3 h-3 mr-1" /> Warning</Badge>;
      case 'MISMATCH':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Mismatch</Badge>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Obligations Section */}
      {obligations && obligations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">HMRC Obligations</CardTitle>
            <CardDescription>Outstanding VAT return periods from HMRC</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {obligations.map((obl) => (
                  <TableRow key={obl.id}>
                    <TableCell>
                      {format(new Date(obl.period_start), 'dd MMM yyyy')} - {format(new Date(obl.period_end), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>{format(new Date(obl.due_date), 'dd MMM yyyy')}</TableCell>
                    <TableCell>
                      {obl.status === 'O' ? (
                        <Badge variant="outline">Open</Badge>
                      ) : (
                        <Badge className="bg-green-500">Filed</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {obl.status === 'O' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateMutation.mutate({
                            periodStart: obl.period_start,
                            periodEnd: obl.period_end,
                            periodKey: obl.period_key,
                          })}
                          disabled={generateMutation.isPending}
                        >
                          <Calculator className="w-4 h-4 mr-2" />
                          Calculate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* VAT Periods List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">VAT Periods</CardTitle>
        </CardHeader>
        <CardContent>
          {periods && periods.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Scheme</TableHead>
                  <TableHead>Box 5 (Net VAT)</TableHead>
                  <TableHead>Reconciliation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((period) => (
                  <TableRow key={period.id}>
                    <TableCell>
                      {format(new Date(period.period_start), 'dd MMM yyyy')} - {format(new Date(period.period_end), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{period.vat_scheme}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      £{Number(period.computed_box5 || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {getReconciliationBadge(period.reconciliation_status)}
                    </TableCell>
                    <TableCell>{getStatusBadge(period.status)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedPeriod(period);
                          generateMutation.mutate({
                            periodStart: period.period_start,
                            periodEnd: period.period_end,
                            periodKey: period.period_key,
                          });
                        }}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No VAT periods found</p>
              <p className="text-sm">Calculate a period from HMRC obligations above</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* VAT Report Detail Dialog */}
      <Dialog open={!!reportModel} onOpenChange={() => { setReportModel(null); setValidation(null); setReconciliation(null); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>VAT Return Summary</DialogTitle>
            <DialogDescription>
              {reportModel && `${format(new Date(reportModel.period_start), 'dd MMM yyyy')} - ${format(new Date(reportModel.period_end), 'dd MMM yyyy')}`}
            </DialogDescription>
          </DialogHeader>

          {reportModel && (
            <Tabs defaultValue="summary">
              <TabsList>
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="reconciliation">
                  <Shield className="w-4 h-4 mr-1" />
                  Reconciliation
                </TabsTrigger>
                <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
                <TabsTrigger value="validation">Validation</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="space-y-4">
                {/* 9 Boxes Grid */}
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((boxNum) => {
                    const boxKey = `box${boxNum}_${{
                      1: 'vat_on_sales',
                      2: 'vat_on_acquisitions',
                      3: 'total_vat_due',
                      4: 'vat_reclaimed',
                      5: 'net_vat_due',
                      6: 'total_sales_ex_vat',
                      7: 'total_purchases_ex_vat',
                      8: 'goods_supplied_ex_vat',
                      9: 'acquisitions_ex_vat',
                    }[boxNum]}` as keyof VATReportModel;
                    const value = reportModel[boxKey] as number;
                    const isHighlight = boxNum === 5;
                    
                    return (
                      <Card key={boxNum} className={isHighlight ? 'border-primary' : ''}>
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">Box {boxNum}</div>
                          <div className={`text-2xl font-mono ${isHighlight ? 'text-primary font-bold' : ''}`}>
                            £{typeof value === 'number' ? value.toFixed(boxNum <= 5 ? 2 : 0) : '0'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {{
                              1: 'VAT due on sales',
                              2: 'VAT due on EU acquisitions',
                              3: 'Total VAT due',
                              4: 'VAT reclaimed',
                              5: 'Net VAT to pay/reclaim',
                              6: 'Total sales ex VAT',
                              7: 'Total purchases ex VAT',
                              8: 'EU goods supplied',
                              9: 'EU acquisitions',
                            }[boxNum]}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Reconciliation */}
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Control Account Reconciliation</div>
                        <div className="text-sm text-muted-foreground">
                          Control: £{reportModel.reconciliation.control_account_balance.toFixed(2)} | 
                          Computed: £{reportModel.reconciliation.computed_vat_balance.toFixed(2)} | 
                          Difference: £{reportModel.reconciliation.difference.toFixed(2)}
                        </div>
                      </div>
                      {getReconciliationBadge(reportModel.reconciliation.status)}
                    </div>
                  </CardContent>
                </Card>

                {/* Scheme Info */}
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline">{reportModel.vat_scheme}</Badge>
                  {reportModel.partial_exemption_applicable && (
                    <Badge variant="secondary">
                      Partial Exemption: {((reportModel.partial_exemption_rate || 0) * 100).toFixed(1)}%
                    </Badge>
                  )}
                  {reportModel.flat_rate_percentage && (
                    <Badge variant="secondary">
                      Flat Rate: {reportModel.flat_rate_percentage}%
                    </Badge>
                  )}
                  <Badge variant="outline">{reportModel.transaction_count} transactions</Badge>
                </div>
              </TabsContent>

              <TabsContent value="reconciliation" className="space-y-4">
                {organization && reportModel.period_id && (
                  <VATReconciliationPanel
                    organizationId={organization.id}
                    entityId={entityId}
                    entityType={entityType}
                    vatPeriodId={reportModel.period_id}
                    expectedVat={reportModel.box5_net_vat_due}
                    periodStart={reportModel.period_start}
                    periodEnd={reportModel.period_end}
                    reconciliation={reconciliation}
                    onReconciliationUpdated={async () => {
                      if (reportModel.period_id) {
                        const recon = await getReconciliation(reportModel.period_id);
                        setReconciliation(recon);
                      }
                      queryClient.invalidateQueries({ queryKey: ['vat-periods'] });
                    }}
                  />
                )}
              </TabsContent>

              <TabsContent value="breakdown" className="space-y-4">
                {reportModel.box_breakdowns.map((breakdown) => (
                  <Collapsible 
                    key={breakdown.box_number}
                    open={expandedBoxes.has(breakdown.box_number)}
                    onOpenChange={() => toggleBoxExpand(breakdown.box_number)}
                  >
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between">
                        <span>
                          Box {breakdown.box_number}: {breakdown.box_name}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-mono">£{breakdown.final_value.toFixed(breakdown.box_number <= 5 ? 2 : 0)}</span>
                          {expandedBoxes.has(breakdown.box_number) ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </span>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 py-2 bg-muted/50 rounded">
                      {breakdown.vat_codes.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tax Code</TableHead>
                              <TableHead>Rate</TableHead>
                              <TableHead>Transactions</TableHead>
                              <TableHead className="text-right">Contribution</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {breakdown.vat_codes.map((vc) => (
                              <TableRow key={vc.vat_code}>
                                <TableCell>{vc.vat_code}</TableCell>
                                <TableCell>{vc.vat_rate}%</TableCell>
                                <TableCell>{vc.transaction_count}</TableCell>
                                <TableCell className="text-right font-mono">
                                  £{(vc.box_contributions[breakdown.box_number] || 0).toFixed(2)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="text-sm text-muted-foreground text-center py-2">
                          No contributions to this box
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </TabsContent>

              <TabsContent value="validation" className="space-y-4">
                {validation && (
                  <>
                    {validation.errors.length > 0 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <div className="font-medium mb-2">Errors ({validation.errors.length})</div>
                          <ul className="list-disc list-inside space-y-1">
                            {validation.errors.map((err, i) => (
                              <li key={i}>{err.message}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                    {validation.warnings.length > 0 && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <div className="font-medium mb-2">Warnings ({validation.warnings.length})</div>
                          <ul className="list-disc list-inside space-y-1">
                            {validation.warnings.map((warn, i) => (
                              <li key={i}>{warn.message}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                    {validation.errors.length === 0 && validation.warnings.length === 0 && (
                      <Alert className="border-green-500">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <AlertDescription>
                          All validations passed. Ready for finalisation.
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setReportModel(null); setValidation(null); }}>
              Close
            </Button>
            {reportModel && validation?.canFinalise && selectedPeriod?.status !== 'FINALISED' && (
              <Button 
                onClick={() => finaliseMutation.mutate(reportModel.period_id)}
                disabled={finaliseMutation.isPending}
              >
                <Send className="w-4 h-4 mr-2" />
                Finalise Period
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
