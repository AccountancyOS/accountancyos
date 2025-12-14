import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addVATAdjustment } from "@/lib/vat-period-generator";
import type { VATAdjustment } from "@/lib/vat-period-generator";

interface VATAdjustmentsPanelProps {
  vatPeriodId: string;
  organizationId: string;
  adjustments: VATAdjustment[];
  isEditable: boolean;
  onAdjustmentAdded?: () => void;
}

const ADJUSTMENT_TYPES = [
  { value: 'BAD_DEBT_RELIEF', label: 'Bad Debt Relief' },
  { value: 'PARTIAL_EXEMPTION', label: 'Partial Exemption' },
  { value: 'FUEL_SCALE_CHARGE', label: 'Fuel Scale Charge' },
  { value: 'CAPITAL_GOODS_SCHEME', label: 'Capital Goods Scheme' },
  { value: 'PRIOR_PERIOD_CORRECTION', label: 'Prior Period Correction' },
  { value: 'FLAT_RATE_ADJUSTMENT', label: 'Flat Rate Adjustment' },
  { value: 'CASH_ACCOUNTING_TIMING', label: 'Cash Accounting Timing' },
  { value: 'MANUAL_CORRECTION', label: 'Manual Correction' },
  { value: 'OTHER', label: 'Other' },
];

export function VATAdjustmentsPanel({
  vatPeriodId,
  organizationId,
  adjustments,
  isEditable,
  onAdjustmentAdded,
}: VATAdjustmentsPanelProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    adjustment_type: '',
    reason: '',
    description: '',
    vat_adjustment: 0,
    affected_box: 1,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const boxAdjustments: Record<number, number> = {};
      boxAdjustments[formData.affected_box] = formData.vat_adjustment;

      await addVATAdjustment(organizationId, vatPeriodId, {
        adjustment_type: formData.adjustment_type,
        reason: formData.reason,
        description: formData.description,
        net_adjustment: 0,
        vat_adjustment: formData.vat_adjustment,
        boxes_affected: [formData.affected_box],
        box_adjustments: boxAdjustments,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-periods'] });
      toast.success('Adjustment added');
      setIsDialogOpen(false);
      setFormData({
        adjustment_type: '',
        reason: '',
        description: '',
        vat_adjustment: 0,
        affected_box: 1,
      });
      onAdjustmentAdded?.();
    },
    onError: (error: Error) => {
      toast.error(`Failed to add adjustment: ${error.message}`);
    },
  });

  const getTypeLabel = (type: string) => {
    return ADJUSTMENT_TYPES.find(t => t.value === type)?.label || type;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">VAT Adjustments</CardTitle>
        {isEditable && (
          <Button size="sm" onClick={() => setIsDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Adjustment
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {adjustments.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Boxes</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustments.map((adj) => (
                <TableRow key={adj.id}>
                  <TableCell>
                    <Badge variant="outline">{getTypeLabel(adj.adjustment_type)}</Badge>
                  </TableCell>
                  <TableCell>{adj.reason}</TableCell>
                  <TableCell>
                    {adj.boxes_affected.map(b => `Box ${b}`).join(', ')}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    £{adj.vat_adjustment.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            No adjustments recorded
          </div>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add VAT Adjustment</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Adjustment Type</Label>
              <Select
                value={formData.adjustment_type}
                onValueChange={(v) => setFormData({ ...formData, adjustment_type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Affected Box</Label>
              <Select
                value={String(formData.affected_box)}
                onValueChange={(v) => setFormData({ ...formData, affected_box: parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Box 1 - VAT on sales</SelectItem>
                  <SelectItem value="2">Box 2 - VAT on EU acquisitions</SelectItem>
                  <SelectItem value="4">Box 4 - VAT reclaimed</SelectItem>
                  <SelectItem value="6">Box 6 - Total sales</SelectItem>
                  <SelectItem value="7">Box 7 - Total purchases</SelectItem>
                  <SelectItem value="8">Box 8 - EU goods supplied</SelectItem>
                  <SelectItem value="9">Box 9 - EU acquisitions</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Amount (£)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.vat_adjustment}
                onChange={(e) => setFormData({ ...formData, vat_adjustment: parseFloat(e.target.value) || 0 })}
                placeholder="Enter amount (use negative for reductions)"
              />
            </div>

            <div className="space-y-2">
              <Label>Reason (Required)</Label>
              <Input
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Brief reason for adjustment"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional detailed description..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => addMutation.mutate()}
              disabled={!formData.adjustment_type || !formData.reason || addMutation.isPending}
            >
              Add Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
