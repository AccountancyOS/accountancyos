/**
 * CryptoImportDialog — CSV import for crypto transactions.
 * Supports standard CSV format with columns: date, type, token, quantity, cost_gbp, proceeds_gbp, fee_gbp, exchange, notes
 */

import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { parseCryptoCSVRow, type CryptoTransaction, type CryptoCSVRow } from "@/lib/cgt-crypto-engine";
import Papa from "papaparse";

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (transactions: CryptoTransaction[]) => void;
}

export function CryptoImportDialog({ open, onClose, onImport }: Props) {
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<CryptoTransaction[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [step, setStep] = useState<'input' | 'preview'>('input');

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
    };
    reader.readAsText(file);
  }, []);

  const handleParse = useCallback(() => {
    const result = Papa.parse<CryptoCSVRow>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
    });

    const txs: CryptoTransaction[] = [];
    const errs: string[] = [];

    result.data.forEach((row, idx) => {
      const tx = parseCryptoCSVRow(row);
      if (tx) {
        txs.push(tx);
      } else {
        errs.push(`Row ${idx + 2}: Invalid transaction type "${row.type}"`);
      }
    });

    if (result.errors.length > 0) {
      result.errors.forEach(e => errs.push(`CSV error at row ${(e.row || 0) + 2}: ${e.message}`));
    }

    setParsed(txs);
    setErrors(errs);
    setStep('preview');
  }, [csvText]);

  const handleConfirm = () => {
    onImport(parsed);
    setCsvText("");
    setParsed([]);
    setErrors([]);
    setStep('input');
    onClose();
  };

  const handleCancel = () => {
    setCsvText("");
    setParsed([]);
    setErrors([]);
    setStep('input');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleCancel()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Crypto Transactions
          </DialogTitle>
        </DialogHeader>

        {step === 'input' && (
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Upload CSV File</Label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="mt-1 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>

            <div className="text-center text-sm text-muted-foreground">or paste CSV below</div>

            <div>
              <Label className="text-sm font-medium">CSV Data</Label>
              <Textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="date,type,token,quantity,cost_gbp,proceeds_gbp,fee_gbp,exchange,notes"
                className="mt-1 font-mono text-xs"
                rows={10}
              />
            </div>

            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Required columns:</strong> date, type, token, quantity, cost_gbp, proceeds_gbp, fee_gbp<br />
                <strong>Optional:</strong> exchange, notes<br />
                <strong>Types:</strong> buy, sell, swap_in, swap_out, airdrop, fork, mining, staking, gift_received, gift_given, lost, transfer_in, transfer_out, fee
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button onClick={handleParse} disabled={!csvText.trim()}>Parse & Preview</Button>
            </DialogFooter>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            {errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium">{errors.length} warning(s):</p>
                  <ul className="list-disc ml-4 mt-1 text-xs">
                    {errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                    {errors.length > 5 && <li>...and {errors.length - 5} more</li>}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div>
              <p className="text-sm font-medium mb-2">{parsed.length} transactions parsed</p>
              <div className="max-h-60 overflow-y-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Date</th>
                      <th className="px-2 py-1.5 text-left">Type</th>
                      <th className="px-2 py-1.5 text-left">Token</th>
                      <th className="px-2 py-1.5 text-right">Qty</th>
                      <th className="px-2 py-1.5 text-right">Cost</th>
                      <th className="px-2 py-1.5 text-right">Proceeds</th>
                      <th className="px-2 py-1.5 text-right">Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 50).map((tx, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">{tx.tx_date}</td>
                        <td className="px-2 py-1">{tx.tx_type}</td>
                        <td className="px-2 py-1 font-medium">{tx.token_symbol}</td>
                        <td className="px-2 py-1 text-right">{tx.quantity}</td>
                        <td className="px-2 py-1 text-right">£{tx.cost_gbp.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">£{tx.proceeds_gbp.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">£{tx.fee_gbp.toFixed(2)}</td>
                      </tr>
                    ))}
                    {parsed.length > 50 && (
                      <tr><td colSpan={7} className="px-2 py-1 text-center text-muted-foreground">...{parsed.length - 50} more rows</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('input')}>Back</Button>
              <Button onClick={handleConfirm} disabled={parsed.length === 0}>
                Import {parsed.length} Transactions
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
