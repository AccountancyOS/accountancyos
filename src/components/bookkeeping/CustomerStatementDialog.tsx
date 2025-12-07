import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerStatementData } from "@/lib/invoice-service";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { format, subMonths } from "date-fns";

interface CustomerStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
}

export default function CustomerStatementDialog({
  open,
  onOpenChange,
  customerId,
}: CustomerStatementDialogProps) {
  const [startDate, setStartDate] = useState(format(subMonths(new Date(), 3), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading } = useQuery({
    queryKey: ["customer-statement", customerId, startDate, endDate],
    queryFn: () => getCustomerStatementData(customerId, startDate, endDate),
    enabled: open && !!customerId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customer Statement</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-4">
            <div>
              <Label>From</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {isLoading ? (
            <div className="py-8 text-center">Loading...</div>
          ) : data ? (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-md">
                <h3 className="font-semibold">{data.customer?.name}</h3>
                <p className="text-sm text-muted-foreground">{data.customer?.email}</p>
              </div>

              <div className="border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Type</th>
                      <th className="p-2 text-left">Reference</th>
                      <th className="p-2 text-right">Debit</th>
                      <th className="p-2 text-right">Credit</th>
                      <th className="p-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t bg-muted/50">
                      <td className="p-2" colSpan={5}>Opening Balance</td>
                      <td className="p-2 text-right font-medium">{formatCurrency(data.openingBalance)}</td>
                    </tr>
                    {data.transactions.map((tx: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{tx.date ? format(new Date(tx.date), "dd MMM yyyy") : "—"}</td>
                        <td className="p-2">{tx.type}</td>
                        <td className="p-2">{tx.reference || "—"}</td>
                        <td className="p-2 text-right">{tx.debit ? formatCurrency(tx.debit) : ""}</td>
                        <td className="p-2 text-right">{tx.credit ? formatCurrency(tx.credit) : ""}</td>
                        <td className="p-2 text-right">{formatCurrency(tx.runningBalance)}</td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/50 font-medium">
                      <td className="p-2" colSpan={5}>Closing Balance</td>
                      <td className="p-2 text-right">{formatCurrency(data.closingBalance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No data</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
