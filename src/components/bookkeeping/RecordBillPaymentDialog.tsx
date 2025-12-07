import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { recordBillPayment } from "@/lib/bills-service";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/bookkeeping-utils";

interface RecordBillPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string;
  onSuccess: () => void;
}

export default function RecordBillPaymentDialog({
  open,
  onOpenChange,
  billId,
  onSuccess,
}: RecordBillPaymentDialogProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");

  // Fetch bill details
  const { data: bill } = useQuery({
    queryKey: ["bill-for-payment", billId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("*, suppliers(name)")
        .eq("id", billId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!billId,
  });

  // Fetch bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ["bank-accounts-for-bill-payment", bill?.organization_id, bill?.company_id, bill?.client_id],
    queryFn: async () => {
      if (!bill) return [];
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, name")
        .eq("organization_id", bill.organization_id)
        .eq(bill.company_id ? "company_id" : "client_id", bill.company_id || bill.client_id)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!bill,
  });

  useEffect(() => {
    if (bill) {
      setAmount(String(bill.remaining_balance ?? bill.total_gross ?? 0));
    }
  }, [bill]);

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      
      const result = await recordBillPayment(billId, {
        amount: parseFloat(amount),
        paymentDate,
        bankAccountId: bankAccountId || undefined,
        reference: reference || undefined,
        paymentMethod,
      }, user.id);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      onSuccess();
    },
    onError: (error: any) => {
      toast.error("Failed to record payment: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    paymentMutation.mutate();
  };

  const outstanding = bill?.remaining_balance ?? bill?.total_gross ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Bill Payment</DialogTitle>
        </DialogHeader>

        {bill && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-muted p-3 rounded-md space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bill:</span>
                <span className="font-medium">{bill.bill_number || bill.reference || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Supplier:</span>
                <span>{(bill.suppliers as any)?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Outstanding:</span>
                <span className="font-medium">{formatCurrency(outstanding)}</span>
              </div>
            </div>

            <div>
              <Label htmlFor="amount">Payment Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="paymentDate">Payment Date *</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="bankAccountId">Bank Account</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {bankAccounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="direct_debit">Direct Debit</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Payment reference"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={paymentMutation.isPending}>
                {paymentMutation.isPending ? "Recording..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
