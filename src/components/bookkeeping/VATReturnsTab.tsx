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
import { Plus, Calculator, Send, FileText } from "lucide-react";
import { format, addMonths, endOfMonth, startOfMonth } from "date-fns";
import { toast } from "sonner";

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

  const submitMutation = useMutation({
    mutationFn: async (vatReturnId: string) => {
      const { error } = await supabase
        .from('vat_returns')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', vatReturnId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-returns'] });
      toast.success("VAT return marked as submitted");
    },
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
                      onClick={() => submitMutation.mutate(vr.id)}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
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
