import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  CheckCircle2, AlertTriangle, Info, ChevronDown, ChevronRight,
  FileCheck, Calculator, Shield
} from "lucide-react";
import { toast } from "sonner";
import { 
  VATReconciliationResult, 
  acknowledgeReconciliation,
  calculateVATReconciliation 
} from "@/lib/vat-reconciliation-service";
import { format } from "date-fns";

interface VATReconciliationPanelProps {
  organizationId: string;
  entityId: string;
  entityType: 'company' | 'client';
  vatPeriodId: string;
  expectedVat: number;
  periodStart: string;
  periodEnd: string;
  reconciliation?: VATReconciliationResult | null;
  snapshotId?: string;
  onReconciliationUpdated?: () => void;
}

export function VATReconciliationPanel({
  organizationId,
  entityId,
  entityType,
  vatPeriodId,
  expectedVat,
  periodStart,
  periodEnd,
  reconciliation,
  snapshotId,
  onReconciliationUpdated,
}: VATReconciliationPanelProps) {
  const queryClient = useQueryClient();
  const [showAckDialog, setShowAckDialog] = useState(false);
  const [ackNote, setAckNote] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  // Calculate reconciliation mutation
  const calculateMutation = useMutation({
    mutationFn: async () => {
      return calculateVATReconciliation(
        organizationId,
        entityId,
        entityType,
        vatPeriodId,
        expectedVat,
        periodStart,
        periodEnd,
        { snapshotId }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-reconciliation'] });
      onReconciliationUpdated?.();
      toast.success('Reconciliation calculated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to calculate: ${error.message}`);
    },
  });

  // Acknowledge mutation
  const acknowledgeMutation = useMutation({
    mutationFn: async () => {
      if (!reconciliation?.id) throw new Error('No reconciliation to acknowledge');
      return acknowledgeReconciliation(reconciliation.id, ackNote || undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-reconciliation'] });
      onReconciliationUpdated?.();
      setShowAckDialog(false);
      setAckNote("");
      toast.success('Reconciliation difference acknowledged');
    },
    onError: (error: Error) => {
      toast.error(`Failed to acknowledge: ${error.message}`);
    },
  });

  if (!reconciliation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Control Account Reconciliation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <p className="text-muted-foreground mb-4">
              Reconciliation not yet calculated for this period
            </p>
            <Button 
              onClick={() => calculateMutation.mutate()}
              disabled={calculateMutation.isPending}
            >
              <Calculator className="w-4 h-4 mr-2" />
              {calculateMutation.isPending ? 'Calculating...' : 'Calculate Reconciliation'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isWarning = reconciliation.classification === 'WARNING';
  const isAcknowledged = reconciliation.acknowledged;

  return (
    <>
      <Card className={isWarning && !isAcknowledged ? 'border-amber-500' : ''}>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Control Account Reconciliation
            </span>
            <ClassificationBadge 
              classification={reconciliation.classification} 
              acknowledged={isAcknowledged}
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Warning banner */}
          {isWarning && !isAcknowledged && (
            <Alert variant="default" className="border-amber-500 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertTitle>Material Difference Detected</AlertTitle>
              <AlertDescription>
                A £{reconciliation.absolute_difference.toFixed(2)} difference between the VAT return 
                and control account requires acknowledgement before HMRC submission.
              </AlertDescription>
            </Alert>
          )}

          {/* Reconciliation summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted">
              <div className="text-sm text-muted-foreground">Expected (Box 5)</div>
              <div className="text-2xl font-mono">
                £{reconciliation.expected_vat.toFixed(2)}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <div className="text-sm text-muted-foreground">Control Account</div>
              <div className="text-2xl font-mono">
                £{reconciliation.actual_vat.toFixed(2)}
              </div>
            </div>
            <div className={`p-4 rounded-lg ${isWarning ? 'bg-amber-500/10' : 'bg-green-500/10'}`}>
              <div className="text-sm text-muted-foreground">Difference</div>
              <div className={`text-2xl font-mono ${isWarning ? 'text-amber-500' : 'text-green-500'}`}>
                £{reconciliation.difference.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Acknowledgement info */}
          {isAcknowledged && (
            <Alert variant="default" className="border-green-500 bg-green-500/10">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertTitle>Acknowledged</AlertTitle>
              <AlertDescription>
                <p>
                  Acknowledged on {reconciliation.acknowledged_at 
                    ? format(new Date(reconciliation.acknowledged_at), 'dd MMM yyyy HH:mm')
                    : 'N/A'
                  }
                </p>
                {reconciliation.acknowledgement_note && (
                  <p className="mt-1 italic">"{reconciliation.acknowledgement_note}"</p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Details collapsible */}
          {reconciliation.calculation_details && (
            <Collapsible open={showDetails} onOpenChange={setShowDetails}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between">
                  <span>Calculation Details</span>
                  {showDetails ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Opening VAT Balance</TableCell>
                      <TableCell className="text-right font-mono">
                        £{reconciliation.calculation_details.opening_vat_balance.toFixed(2)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">VAT on Transactions</TableCell>
                      <TableCell className="text-right font-mono">
                        £{reconciliation.calculation_details.vat_on_transactions.toFixed(2)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">VAT Journals</TableCell>
                      <TableCell className="text-right font-mono">
                        £{reconciliation.calculation_details.vat_journals.toFixed(2)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">VAT Payments Made</TableCell>
                      <TableCell className="text-right font-mono text-red-500">
                        (£{reconciliation.calculation_details.vat_payments.toFixed(2)})
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">VAT Refunds Received</TableCell>
                      <TableCell className="text-right font-mono text-green-500">
                        £{reconciliation.calculation_details.vat_refunds.toFixed(2)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-t-2">
                      <TableCell className="font-medium">Closing VAT Balance</TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        £{reconciliation.calculation_details.closing_vat_balance.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                {reconciliation.calculation_details.control_accounts.length > 0 && (
                  <div className="mt-4">
                    <div className="text-sm font-medium mb-2">Control Accounts</div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reconciliation.calculation_details.control_accounts.map(acc => (
                          <TableRow key={acc.account_id}>
                            <TableCell>{acc.account_code}</TableCell>
                            <TableCell>{acc.account_name}</TableCell>
                            <TableCell className="text-right font-mono">
                              £{acc.balance.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => calculateMutation.mutate()}
              disabled={calculateMutation.isPending}
            >
              <Calculator className="w-4 h-4 mr-2" />
              Recalculate
            </Button>
            {isWarning && !isAcknowledged && (
              <Button
                size="sm"
                onClick={() => setShowAckDialog(true)}
              >
                <FileCheck className="w-4 h-4 mr-2" />
                Acknowledge Difference
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Acknowledgement Dialog */}
      <Dialog open={showAckDialog} onOpenChange={setShowAckDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge Reconciliation Difference</DialogTitle>
            <DialogDescription>
              You are acknowledging a £{reconciliation.absolute_difference.toFixed(2)} difference 
              between the VAT return (Box 5) and the control account balance.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This acknowledgement confirms you have reviewed the difference and accept 
                professional responsibility for proceeding with the VAT submission.
              </AlertDescription>
            </Alert>

            <div>
              <label className="text-sm font-medium">
                Explanation (optional but recommended)
              </label>
              <Textarea
                placeholder="e.g., Timing difference on Q4 invoice, reverses next period..."
                value={ackNote}
                onChange={(e) => setAckNote(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAckDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => acknowledgeMutation.mutate()}
              disabled={acknowledgeMutation.isPending}
            >
              {acknowledgeMutation.isPending ? 'Acknowledging...' : 'Acknowledge & Proceed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClassificationBadge({ 
  classification, 
  acknowledged 
}: { 
  classification: 'INFO' | 'WARNING'; 
  acknowledged: boolean;
}) {
  if (classification === 'INFO') {
    return (
      <Badge className="bg-green-500">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Matched
      </Badge>
    );
  }

  if (acknowledged) {
    return (
      <Badge className="bg-blue-500">
        <FileCheck className="w-3 h-3 mr-1" />
        Acknowledged
      </Badge>
    );
  }

  return (
    <Badge className="bg-amber-500">
      <AlertTriangle className="w-3 h-3 mr-1" />
      Warning
    </Badge>
  );
}
