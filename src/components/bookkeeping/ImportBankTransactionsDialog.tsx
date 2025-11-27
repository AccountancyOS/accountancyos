import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import Papa from "papaparse";

interface ImportBankTransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity;
  bankAccountId: string;
}

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  balance?: number;
}

export function ImportBankTransactionsDialog({
  open,
  onOpenChange,
  entity,
  bankAccountId,
}: ImportBankTransactionsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedTransaction[]>([]);
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    // Parse CSV
    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        // Simple CSV parsing - assumes columns: Date, Description, Amount, Balance (optional)
        const transactions: ParsedTransaction[] = results.data.map((row: any) => ({
          date: row.Date || row.date || "",
          description: row.Description || row.description || "",
          amount: parseFloat(row.Amount || row.amount || "0"),
          balance: row.Balance ? parseFloat(row.Balance) : undefined,
        }));
        setParsedData(transactions);
        toast.success(`Parsed ${transactions.length} transactions`);
      },
      error: (error) => {
        toast.error("Failed to parse CSV", {
          description: error.message,
        });
      },
    });
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !bankAccountId || parsedData.length === 0) {
        throw new Error("Missing required data");
      }

      const batchId = crypto.randomUUID();

      const transactions = parsedData.map((tx) => ({
        organization_id: organization.id,
        client_id: entity.type === "client" ? entity.id : null,
        company_id: entity.type === "company" ? entity.id : null,
        bank_account_id: bankAccountId,
        transaction_date: tx.date,
        description: tx.description,
        amount: tx.amount,
        balance: tx.balance,
        import_source: "CSV",
        import_batch_id: batchId,
        status: "UNREVIEWED",
      }));

      const { error } = await supabase
        .from("bank_transactions")
        .insert(transactions);

      if (error) throw error;

      return transactions.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast.success(`Imported ${count} transactions`);
      setFile(null);
      setParsedData([]);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to import transactions", {
        description: error.message,
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Bank Transactions</DialogTitle>
          <DialogDescription>
            Upload a CSV file with columns: Date, Description, Amount, Balance (optional)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv-file">CSV File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
            />
          </div>

          {parsedData.length > 0 && (
            <div className="space-y-2">
              <Label>Preview ({parsedData.length} transactions)</Label>
              <div className="border rounded-lg p-4 max-h-[300px] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Date</th>
                      <th className="text-left py-2">Description</th>
                      <th className="text-right py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 10).map((tx, idx) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="py-2">{tx.date}</td>
                        <td className="py-2">{tx.description}</td>
                        <td className="py-2 text-right">{tx.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedData.length > 10 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    ... and {parsedData.length - 10} more
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => importMutation.mutate()}
            disabled={parsedData.length === 0 || importMutation.isPending}
          >
            {importMutation.isPending ? "Importing..." : `Import ${parsedData.length} Transactions`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
