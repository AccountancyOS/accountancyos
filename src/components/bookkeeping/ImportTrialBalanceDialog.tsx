import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import Papa from "papaparse";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Check, AlertCircle, ArrowRight, Save } from "lucide-react";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { Checkbox } from "@/components/ui/checkbox";

interface ImportTrialBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity;
  periodStart: Date;
  periodEnd: Date;
}

interface ParsedRow {
  code: string;
  name: string;
  debit: number;
  credit: number;
  balance: number;
  mappedAccountId?: string;
  mappedAccountCode?: string;
  mappedAccountName?: string;
  isNew?: boolean;
}

interface ColumnMapping {
  code: number | null;
  name: number | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

type SourceType = "xero" | "quickbooks" | "sage" | "freeagent" | "csv";

const sourceLabels: Record<SourceType, string> = {
  xero: "Xero",
  quickbooks: "QuickBooks",
  sage: "Sage",
  freeagent: "FreeAgent",
  csv: "Generic CSV",
};

export function ImportTrialBalanceDialog({
  open,
  onOpenChange,
  entity,
  periodStart,
  periodEnd,
}: ImportTrialBalanceDialogProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<"upload" | "map-columns" | "map-accounts" | "review">("upload");
  const [sourceType, setSourceType] = useState<SourceType>("csv");
  const [file, setFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    code: null,
    name: null,
    debit: null,
    credit: null,
    balance: null,
  });
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [saveMapping, setSaveMapping] = useState(true);
  const [mappingTemplateName, setMappingTemplateName] = useState("");

  // Fetch existing accounts for mapping
  const { data: existingAccounts } = useQuery({
    queryKey: ["bookkeeping-accounts", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      const query = supabase
        .from("bookkeeping_accounts")
        .select("id, code, name, account_type")
        .eq("organization_id", organization.id)
        .eq("is_active", true);
      
      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id && open,
  });

  // Fetch saved mappings for this entity
  const { data: savedMappings } = useQuery({
    queryKey: ["tb-account-mappings", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      const query = supabase
        .from("tb_account_mappings")
        .select("*")
        .eq("organization_id", organization.id);
      
      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id && open,
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    
    Papa.parse(selectedFile, {
      complete: (results) => {
        const data = results.data as string[][];
        if (data.length > 0) {
          setHeaders(data[0]);
          setRawData(data.slice(1).filter(row => row.some(cell => cell.trim())));
          
          // Auto-detect columns
          const headerLower = data[0].map(h => h.toLowerCase());
          const autoMapping: ColumnMapping = {
            code: headerLower.findIndex(h => h.includes("code") || h.includes("account no") || h.includes("nominal")),
            name: headerLower.findIndex(h => h.includes("name") || h.includes("description") || h.includes("account")),
            debit: headerLower.findIndex(h => h.includes("debit") || h.includes("dr")),
            credit: headerLower.findIndex(h => h.includes("credit") || h.includes("cr")),
            balance: headerLower.findIndex(h => h.includes("balance") || h.includes("net")),
          };
          
          // Fix -1 to null
          Object.keys(autoMapping).forEach(key => {
            if (autoMapping[key as keyof ColumnMapping] === -1) {
              autoMapping[key as keyof ColumnMapping] = null;
            }
          });
          
          setColumnMapping(autoMapping);
          setStep("map-columns");
        }
      },
      error: (error) => {
        toast.error("Failed to parse CSV", { description: error.message });
      },
    });
  }, []);

  const processColumnMapping = useCallback(() => {
    if (columnMapping.code === null || columnMapping.name === null) {
      toast.error("Please map at least Code and Name columns");
      return;
    }
    
    // Parse rows
    const rows: ParsedRow[] = rawData.map(row => {
      const code = row[columnMapping.code!]?.trim() || "";
      const name = row[columnMapping.name!]?.trim() || "";
      const debit = parseFloat(row[columnMapping.debit ?? -1]?.replace(/[^0-9.-]/g, "")) || 0;
      const credit = parseFloat(row[columnMapping.credit ?? -1]?.replace(/[^0-9.-]/g, "")) || 0;
      let balance = parseFloat(row[columnMapping.balance ?? -1]?.replace(/[^0-9.-]/g, "")) || 0;
      
      // Calculate balance if not provided
      if (columnMapping.balance === null) {
        balance = debit - credit;
      }
      
      // Try to auto-match to existing accounts
      const matchedAccount = existingAccounts?.find(
        acc => acc.code === code || acc.name.toLowerCase() === name.toLowerCase()
      );
      
      return {
        code,
        name,
        debit,
        credit,
        balance,
        mappedAccountId: matchedAccount?.id,
        mappedAccountCode: matchedAccount?.code,
        mappedAccountName: matchedAccount?.name,
        isNew: !matchedAccount,
      };
    }).filter(row => row.code || row.name);
    
    // Apply saved mappings if available
    const defaultMapping = savedMappings?.find(m => m.is_default && m.source_type === sourceType);
    if (defaultMapping?.mappings) {
      const mappingLookup = new Map<string, any>();
      (defaultMapping.mappings as any[]).forEach(m => {
        mappingLookup.set(m.sourceCode, m);
      });
      
      rows.forEach(row => {
        const saved = mappingLookup.get(row.code);
        if (saved) {
          row.mappedAccountId = saved.targetAccountId;
          row.mappedAccountCode = saved.targetAccountCode;
          row.mappedAccountName = saved.targetAccountName;
          row.isNew = false;
        }
      });
    }
    
    setParsedRows(rows);
    setStep("map-accounts");
  }, [rawData, columnMapping, existingAccounts, savedMappings, sourceType]);

  const updateAccountMapping = (rowIndex: number, accountId: string) => {
    const account = existingAccounts?.find(a => a.id === accountId);
    setParsedRows(prev => prev.map((row, i) => {
      if (i === rowIndex) {
        return {
          ...row,
          mappedAccountId: accountId,
          mappedAccountCode: account?.code,
          mappedAccountName: account?.name,
          isNew: accountId === "new",
        };
      }
      return row;
    }));
  };

  const createSnapshotMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("No organization");
      
      // Build balances array
      const balances = parsedRows.map(row => ({
        accountCode: row.mappedAccountCode || row.code,
        accountName: row.mappedAccountName || row.name,
        accountId: row.mappedAccountId,
        debit: row.debit,
        credit: row.credit,
        balance: row.balance,
        sourceCode: row.code,
        sourceName: row.name,
      }));
      
      // Create snapshot
      const { data: snapshot, error: snapshotError } = await supabase
        .from("trial_balance_snapshots")
        .insert({
          organization_id: organization.id,
          client_id: entity.type === "client" ? entity.id : null,
          company_id: entity.type === "company" ? entity.id : null,
          period_start: periodStart.toISOString().split("T")[0],
          period_end: periodEnd.toISOString().split("T")[0],
          source_type: sourceType === "csv" ? "manual_import" : sourceType,
          status: "draft",
          balances,
          metadata: {
            importedAt: new Date().toISOString(),
            fileName: file?.name,
            rowCount: parsedRows.length,
          },
        })
        .select()
        .single();
      
      if (snapshotError) throw snapshotError;
      
      // Save mapping template if requested
      if (saveMapping && mappingTemplateName) {
        const mappingData = parsedRows.map(row => ({
          sourceCode: row.code,
          sourceName: row.name,
          targetAccountId: row.mappedAccountId,
          targetAccountCode: row.mappedAccountCode,
          targetAccountName: row.mappedAccountName,
        }));
        
        await supabase
          .from("tb_account_mappings")
          .insert([{
            organization_id: organization.id,
            client_id: entity.type === "client" ? entity.id : null,
            company_id: entity.type === "company" ? entity.id : null,
            source_type: sourceType,
            template_name: mappingTemplateName,
            is_default: true,
            mappings: mappingData as any,
            column_config: columnMapping as any,
          }]);
      }
      
      return snapshot;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trial-balance-snapshots"] });
      toast.success("Trial Balance imported successfully");
      resetDialog();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error("Failed to import", { description: error.message });
    },
  });

  const resetDialog = () => {
    setStep("upload");
    setFile(null);
    setRawData([]);
    setHeaders([]);
    setColumnMapping({ code: null, name: null, debit: null, credit: null, balance: null });
    setParsedRows([]);
    setSaveMapping(true);
    setMappingTemplateName("");
  };

  const totals = parsedRows.reduce(
    (acc, row) => ({
      debit: acc.debit + row.debit,
      credit: acc.credit + row.credit,
      balance: acc.balance + row.balance,
    }),
    { debit: 0, credit: 0, balance: 0 }
  );

  const unmappedCount = parsedRows.filter(r => !r.mappedAccountId || r.isNew).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetDialog(); onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Trial Balance</DialogTitle>
          <DialogDescription>
            Import a trial balance for {entity.name} ({periodStart.toLocaleDateString()} - {periodEnd.toLocaleDateString()})
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 py-2 border-b">
          {["upload", "map-columns", "map-accounts", "review"].map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${
                step === s ? "bg-primary text-primary-foreground" : 
                ["upload", "map-columns", "map-accounts", "review"].indexOf(step) > i 
                  ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-background/20 text-xs">
                  {i + 1}
                </span>
                <span className="capitalize">{s.replace("-", " ")}</span>
              </div>
              {i < 3 && <ArrowRight className="h-4 w-4 mx-1 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Source Software</Label>
              <Select value={sourceType} onValueChange={(v) => setSourceType(v as SourceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(sourceLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                id="tb-file-input"
              />
              <label htmlFor="tb-file-input" className="cursor-pointer">
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
                  <p className="text-lg font-medium">Drop CSV file or click to browse</p>
                  <p className="text-sm text-muted-foreground">
                    Export a Trial Balance from {sourceLabels[sourceType]} and upload it here
                  </p>
                </div>
              </label>
            </div>

            {savedMappings && savedMappings.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm font-medium mb-2">Saved Mapping Templates</p>
                <div className="flex flex-wrap gap-2">
                  {savedMappings.map(m => (
                    <Badge key={m.id} variant="secondary">
                      {m.template_name} ({sourceLabels[m.source_type as SourceType]})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Map Columns */}
        {step === "map-columns" && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Map your CSV columns to the required fields
            </p>

            <div className="grid grid-cols-2 gap-4">
              {[
                { key: "code", label: "Account Code", required: true },
                { key: "name", label: "Account Name", required: true },
                { key: "debit", label: "Debit", required: false },
                { key: "credit", label: "Credit", required: false },
                { key: "balance", label: "Balance / Net", required: false },
              ].map(({ key, label, required }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-sm">
                    {label} {required && <span className="text-destructive">*</span>}
                  </Label>
                  <Select
                    value={columnMapping[key as keyof ColumnMapping]?.toString() ?? "none"}
                    onValueChange={(v) => setColumnMapping(prev => ({
                      ...prev,
                      [key]: v === "none" ? null : parseInt(v),
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Not mapped --</SelectItem>
                      {headers.map((header, i) => (
                        <SelectItem key={i} value={i.toString()}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Preview */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted px-3 py-2 text-sm font-medium">Preview (first 5 rows)</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h, i) => (
                      <TableHead key={i} className={
                        Object.values(columnMapping).includes(i) ? "bg-primary/10" : ""
                      }>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rawData.slice(0, 5).map((row, i) => (
                    <TableRow key={i}>
                      {row.map((cell, j) => (
                        <TableCell key={j} className={
                          Object.values(columnMapping).includes(j) ? "bg-primary/10" : ""
                        }>{cell}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Step 3: Map Accounts */}
        {step === "map-accounts" && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Map imported accounts to your chart of accounts
              </p>
              {unmappedCount > 0 && (
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {unmappedCount} unmapped
                </Badge>
              )}
            </div>

            <div className="border rounded-lg max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source Code</TableHead>
                    <TableHead>Source Name</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Map To</TableHead>
                    <TableHead className="w-16">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, i) => (
                    <TableRow key={i} className={!row.mappedAccountId ? "bg-amber-50/50" : ""}>
                      <TableCell className="font-mono">{row.code}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(row.balance)}</TableCell>
                      <TableCell>
                        <Select
                          value={row.mappedAccountId || "new"}
                          onValueChange={(v) => updateAccountMapping(i, v)}
                        >
                          <SelectTrigger className="w-[250px]">
                            <SelectValue placeholder="Select account..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">+ Create new account</SelectItem>
                            {existingAccounts?.map(acc => (
                              <SelectItem key={acc.id} value={acc.id}>
                                {acc.code} - {acc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {row.mappedAccountId && !row.isNew ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === "review" && (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Total Debits</p>
                <p className="text-2xl font-bold">{formatCurrency(totals.debit)}</p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Total Credits</p>
                <p className="text-2xl font-bold">{formatCurrency(totals.credit)}</p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Net Balance</p>
                <p className={`text-2xl font-bold ${Math.abs(totals.balance) < 0.01 ? "text-green-600" : "text-amber-600"}`}>
                  {formatCurrency(totals.balance)}
                </p>
              </div>
            </div>

            {Math.abs(totals.debit - totals.credit) > 0.01 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">Trial Balance does not balance</p>
                  <p className="text-sm text-amber-700">
                    Difference: {formatCurrency(Math.abs(totals.debit - totals.credit))}
                  </p>
                </div>
              </div>
            )}

            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="save-mapping"
                  checked={saveMapping}
                  onCheckedChange={(c) => setSaveMapping(c === true)}
                />
                <Label htmlFor="save-mapping">Save this mapping for future imports</Label>
              </div>
              
              {saveMapping && (
                <div className="ml-6">
                  <Label className="text-sm">Template Name</Label>
                  <Input
                    value={mappingTemplateName}
                    onChange={(e) => setMappingTemplateName(e.target.value)}
                    placeholder={`${entity.name} - ${sourceLabels[sourceType]}`}
                    className="max-w-sm mt-1"
                  />
                </div>
              )}
            </div>

            <div className="text-sm text-muted-foreground">
              <p><strong>{parsedRows.length}</strong> accounts will be imported</p>
              <p>Period: {periodStart.toLocaleDateString()} to {periodEnd.toLocaleDateString()}</p>
              <p>Source: {sourceLabels[sourceType]}</p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step !== "upload" && (
        <Button
          variant="outline"
          onClick={() => {
            if (step === "map-columns") setStep("upload");
            else if (step === "map-accounts") setStep("map-columns");
            else if (step === "review") setStep("map-accounts");
          }}
        >
          Back
        </Button>
          )}
          
          {step === "upload" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          
          {step === "map-columns" && (
            <Button onClick={processColumnMapping}>
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
          
          {step === "map-accounts" && (
            <Button onClick={() => setStep("review")}>
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
          
          {step === "review" && (
            <Button
              onClick={() => createSnapshotMutation.mutate()}
              disabled={createSnapshotMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {createSnapshotMutation.isPending ? "Importing..." : "Import Trial Balance"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
