import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Calculator, Send, FileText, UserCheck, ShieldCheck, Loader2 } from "lucide-react";
import { format, addMonths, endOfMonth, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { approveVatReturnForFiling, revokeVatFilingApproval } from "@/lib/vat-filing-approval";
import { submitVatReturnToHmrc } from "@/lib/vat-filing-submit";
import { vatFilingState } from "@/lib/vat-filing-approval-model";

interface VATReturnsTabProps {
  entityType: 'client' | 'company';
  entityId: string;
}

export function VATReturnsTab({ entityType, entityId }: VATReturnsTabProps) {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<any>(null);
  const [newPeriodStart, setNewPeriodStart] = useState("");
  const [newPeriodEnd, setNewPeriodEnd] = useState("");

  const { data: vatReturns, isLoading } = useQuery({
    queryKey: ['vat-returns', organizationId, entityType, entityId],
    queryFn: async () => {
      const query = supabase
        .from('vat_returns')
        .select('*')
        .eq('organization_id', organizationId!)
        .order('period_end', { ascending: false });

      if (entityType === 'client') {
        query.eq('client_id', entityId);
      } else {
        query.eq('company_id', entityId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId && !!entityId,
  });

  const { data: vatCodes } = useQuery({
    queryKey: ['vat-codes', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vat_codes')
        .select('*')
        .eq('organization_id', organizationId!);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const calculateMutation = useMutation({
    mutationFn: async ({ periodStart, periodEnd }: { periodStart: string; periodEnd: string }) => {
      // Get all ledger entries with VAT codes for this period
      const query = supabase
        .from('ledger_entries')
        .select(`
          *,
          vat_code:vat_codes(*)
        `)
        .eq('organization_id', organizationId!)
        .gte('transaction_date', periodStart)
        .lte('transaction_date', periodEnd)
        .not('vat_code_id', 'is', null);

      if (entityType === 'client') {
        query.eq('client_id', entityId);
      } else {
        query.eq('company_id', entityId);
      }

      const { data: entries, error } = await query;
      if (error) throw error;

      // Calculate VAT boxes
      let box1 = 0; // VAT due on sales
      let box4 = 0; // VAT reclaimed on purchases
      let box6 = 0; // Total sales ex VAT
      let box7 = 0; // Total purchases ex VAT

      entries?.forEach((entry: any) => {
        const vatCode = entry.vat_code;
        if (!vatCode) return;

        const amount = (entry.debit || 0) - (entry.credit || 0);
        const vatRate = vatCode.rate / 100;

        if (vatCode.vat_type === 'OUTPUT') {
          // Sales VAT
          const netAmount = Math.abs(amount) / (1 + vatRate);
          const vatAmount = Math.abs(amount) - netAmount;
          box1 += vatAmount;
          box6 += netAmount;
        } else if (vatCode.vat_type === 'INPUT') {
          // Purchase VAT
          const netAmount = Math.abs(amount) / (1 + vatRate);
          const vatAmount = Math.abs(amount) - netAmount;
          box4 += vatAmount;
          box7 += netAmount;
        } else if (vatCode.vat_type === 'ZERO') {
          // Zero rated - still counts for totals
          box6 += Math.abs(amount);
        }
      });

      const box3 = box1; // Total VAT due (box1 + box2)
      const box5 = box3 - box4; // Net VAT (due or refund)

      // Calculate due date (period end + 1 month + 7 days)
      const dueDate = format(addMonths(new Date(periodEnd), 1), 'yyyy-MM-dd');

      // Create VAT return
      const { data: vatReturn, error: insertError } = await supabase
        .from('vat_returns')
        .insert({
          organization_id: organizationId,
          client_id: entityType === 'client' ? entityId : null,
          company_id: entityType === 'company' ? entityId : null,
          period_start: periodStart,
          period_end: periodEnd,
          due_date: dueDate,
          box_1_vat_due_sales: Math.round(box1 * 100) / 100,
          box_2_vat_due_acquisitions: 0,
          box_3_total_vat_due: Math.round(box3 * 100) / 100,
          box_4_vat_reclaimed: Math.round(box4 * 100) / 100,
          box_5_net_vat: Math.round(box5 * 100) / 100,
          box_6_total_sales: Math.round(box6),
          box_7_total_purchases: Math.round(box7),
          box_8_total_supplies_eu: 0,
          box_9_total_acquisitions_eu: 0,
          status: 'draft',
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return vatReturn;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns'] });
      setShowCreateDialog(false);
      setNewPeriodStart("");
      setNewPeriodEnd("");
      toast.success("VAT return calculated");
    },
    onError: (error) => {
      toast.error("Failed to calculate VAT return");
      console.error(error);
    },
  });

  const requestClientApprovalMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('vat_returns')
        .update({ client_approval_required: true, client_approved_at: null, client_approved_by: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns', organizationId, entityType, entityId] });
      toast.success('Sent to client for approval');
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to request approval'),
  });

  // Stage C: real HMRC transport from the approved snapshot (no more fake status flip). Only an
  // approved, client-cleared, unsubmitted return can be sent; status derives from the response.
  const submitMutation = useMutation({
    mutationFn: async (vr: any) => {
      const res = await submitVatReturnToHmrc(vr, "sandbox");
      if (!res.success) throw new Error(res.error || "HMRC submission failed");
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns'] });
      toast.success("VAT return submitted to HMRC (sandbox).");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "HMRC submission failed"),
  });

  // Stage B: accountant approves an immutable snapshot of the VAT figures for filing.
  const approveMutation = useMutation({
    mutationFn: async (vatReturnId: string) => {
      const res = await approveVatReturnForFiling(vatReturnId);
      if (!res.success) throw new Error(res.error || "Could not approve for filing");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns'] });
      toast.success("VAT return approved for filing (snapshot locked).");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not approve for filing"),
  });

  const revokeApprovalMutation = useMutation({
    mutationFn: async (vatReturnId: string) => {
      const res = await revokeVatFilingApproval(vatReturnId);
      if (!res.success) throw new Error(res.error || "Could not clear approval");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns'] });
      toast.success("Filing approval cleared.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not clear approval"),
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "outline",
      submitted: "default",
      accepted: "secondary",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
  };

  const handleQuickCreate = (quarterOffset: number) => {
    const now = new Date();
    const quarterEnd = endOfMonth(addMonths(now, -3 * quarterOffset));
    const quarterStart = startOfMonth(addMonths(quarterEnd, -2));
    setNewPeriodStart(format(quarterStart, 'yyyy-MM-dd'));
    setNewPeriodEnd(format(quarterEnd, 'yyyy-MM-dd'));
    setShowCreateDialog(true);
  };

  if (isLoading) {
    return <div className="p-4">Loading VAT returns...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">VAT Returns</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleQuickCreate(1)}>
            Previous Quarter
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Return
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead className="text-right">VAT Due</TableHead>
            <TableHead className="text-right">VAT Reclaimed</TableHead>
            <TableHead className="text-right">Net VAT</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vatReturns?.map((vr) => (
            <TableRow key={vr.id}>
              <TableCell>
                {format(new Date(vr.period_start), 'dd MMM yyyy')} - {format(new Date(vr.period_end), 'dd MMM yyyy')}
              </TableCell>
              <TableCell>{format(new Date(vr.due_date), 'dd MMM yyyy')}</TableCell>
              <TableCell className="text-right">{formatCurrency(vr.box_3_total_vat_due)}</TableCell>
              <TableCell className="text-right">{formatCurrency(vr.box_4_vat_reclaimed)}</TableCell>
              <TableCell className={`text-right font-medium ${vr.box_5_net_vat >= 0 ? 'text-destructive' : 'text-green-600'}`}>
                {formatCurrency(Math.abs(vr.box_5_net_vat))} {vr.box_5_net_vat >= 0 ? 'due' : 'refund'}
              </TableCell>
              <TableCell>{getStatusBadge(vr.status)}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setSelectedReturn(vr);
                      setShowDetailDialog(true);
                    }}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                  {vr.status === 'draft' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title={vr.client_approval_required ? 'Awaiting client approval' : 'Request client approval'}
                      onClick={() => requestClientApprovalMutation.mutate(vr.id)}
                      disabled={requestClientApprovalMutation.isPending}
                    >
                      <UserCheck className={`h-4 w-4 ${vr.client_approval_required && !vr.client_approved_at ? 'text-amber-600' : ''}`} />
                    </Button>
                  )}
                  {vr.status === 'draft' && !(vr as any).filing_approved_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Approve for filing (locks an immutable snapshot of these figures)"
                      onClick={() => approveMutation.mutate(vr.id)}
                      disabled={approveMutation.isPending}
                    >
                      {approveMutation.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <ShieldCheck className="h-4 w-4" />}
                    </Button>
                  )}
                  {vr.status === 'draft' && (vr as any).filing_approved_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title={`Approved for filing${(vr as any).snapshot_hash ? ` · snapshot ${String((vr as any).snapshot_hash).slice(0, 8)}…` : ''} — click to clear`}
                      onClick={() => revokeApprovalMutation.mutate(vr.id)}
                      disabled={revokeApprovalMutation.isPending}
                    >
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                    </Button>
                  )}
                  {vr.status === 'draft' && (() => {
                    const state = vatFilingState(vr as any);
                    return (
                      <Button
                        variant="ghost"
                        size="sm"
                        title={state.submittable ? 'Submit to HMRC (sandbox)' : `Cannot submit: ${state.reason}`}
                        onClick={() => submitMutation.mutate(vr)}
                        disabled={!state.submittable || submitMutation.isPending}
                      >
                        {submitMutation.isPending
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Send className="h-4 w-4" />}
                      </Button>
                    );
                  })()}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!vatReturns?.length && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No VAT returns yet
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Calculate VAT Return</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input
                  type="date"
                  value={newPeriodStart}
                  onChange={(e) => setNewPeriodStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input
                  type="date"
                  value={newPeriodEnd}
                  onChange={(e) => setNewPeriodEnd(e.target.value)}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              The VAT return will be calculated from posted ledger entries within this period.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button 
              onClick={() => calculateMutation.mutate({ periodStart: newPeriodStart, periodEnd: newPeriodEnd })}
              disabled={!newPeriodStart || !newPeriodEnd || calculateMutation.isPending}
            >
              <Calculator className="h-4 w-4 mr-2" />
              Calculate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>VAT Return Details</DialogTitle>
          </DialogHeader>
          {selectedReturn && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Period</CardTitle>
                </CardHeader>
                <CardContent>
                  {format(new Date(selectedReturn.period_start), 'dd MMM yyyy')} - {format(new Date(selectedReturn.period_end), 'dd MMM yyyy')}
                </CardContent>
              </Card>
              
              <div className="space-y-2">
                <div className="flex justify-between py-2 border-b">
                  <span>Box 1 - VAT due on sales</span>
                  <span className="font-medium">{formatCurrency(selectedReturn.box_1_vat_due_sales)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span>Box 2 - VAT due on acquisitions</span>
                  <span className="font-medium">{formatCurrency(selectedReturn.box_2_vat_due_acquisitions)}</span>
                </div>
                <div className="flex justify-between py-2 border-b bg-muted/50 px-2 -mx-2">
                  <span className="font-medium">Box 3 - Total VAT due</span>
                  <span className="font-medium">{formatCurrency(selectedReturn.box_3_total_vat_due)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span>Box 4 - VAT reclaimed</span>
                  <span className="font-medium">{formatCurrency(selectedReturn.box_4_vat_reclaimed)}</span>
                </div>
                <div className="flex justify-between py-2 border-b bg-muted/50 px-2 -mx-2">
                  <span className="font-medium">Box 5 - Net VAT</span>
                  <span className={`font-medium ${selectedReturn.box_5_net_vat >= 0 ? 'text-destructive' : 'text-green-600'}`}>
                    {formatCurrency(Math.abs(selectedReturn.box_5_net_vat))} {selectedReturn.box_5_net_vat >= 0 ? 'due' : 'refund'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span>Box 6 - Total sales ex VAT</span>
                  <span className="font-medium">{formatCurrency(selectedReturn.box_6_total_sales)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span>Box 7 - Total purchases ex VAT</span>
                  <span className="font-medium">{formatCurrency(selectedReturn.box_7_total_purchases)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span>Box 8 - EU supplies</span>
                  <span className="font-medium">{formatCurrency(selectedReturn.box_8_total_supplies_eu)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span>Box 9 - EU acquisitions</span>
                  <span className="font-medium">{formatCurrency(selectedReturn.box_9_total_acquisitions_eu)}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
