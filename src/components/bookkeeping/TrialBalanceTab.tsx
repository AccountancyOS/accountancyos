import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileDown, Camera, Upload, Database } from "lucide-react";
import { formatCurrency, getAccountTypeLabel } from "@/lib/bookkeeping-utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { ImportTrialBalanceDialog } from "./ImportTrialBalanceDialog";
import { CreateSnapshotDialog } from "./CreateSnapshotDialog";
import { SnapshotHistoryPanel } from "./SnapshotHistoryPanel";
import { Badge } from "@/components/ui/badge";

interface TrialBalanceTabProps {
  entity: BookkeepingEntity;
}

export function TrialBalanceTab({ entity }: TrialBalanceTabProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear.toString());
  const [period, setPeriod] = useState("year");
  const { organization } = useOrganization();
  
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [snapshotDialogOpen, setSnapshotDialogOpen] = useState(false);

  // Calculate period dates
  const getPeriodDates = () => {
    const y = parseInt(year);
    if (period === "year") {
      return {
        start: new Date(y, 0, 1),
        end: new Date(y, 11, 31),
      };
    }
    // Add quarter/month logic as needed
    return {
      start: new Date(y, 0, 1),
      end: new Date(y, 11, 31),
    };
  };

  const periodDates = getPeriodDates();

  // Fetch live trial balance from ledger
  const { data: trialBalance, isLoading } = useQuery({
    queryKey: [
      "trial-balance",
      organization?.id,
      entity.type,
      entity.id,
      year,
      period,
    ],
    queryFn: async () => {
      if (!organization?.id) return null;

      // Fetch all ledger entries
      const ledgerQuery = supabase
        .from("ledger_entries")
        .select(`
          *,
          account:bookkeeping_accounts(id, code, name, account_type)
        `)
        .eq("organization_id", organization.id);

      if (entity.type === "client") {
        ledgerQuery.eq("client_id", entity.id);
      } else {
        ledgerQuery.eq("company_id", entity.id);
      }

      const { data: entries, error } = await ledgerQuery;
      if (error) throw error;

      // Calculate TB
      const accountMap = new Map<string, any>();

      entries.forEach((entry) => {
        const entryDate = new Date(entry.transaction_date);
        const isBeforePeriod = entryDate < periodDates.start;
        const isInPeriod =
          entryDate >= periodDates.start && entryDate <= periodDates.end;

        if (!accountMap.has(entry.account.id)) {
          accountMap.set(entry.account.id, {
            ...entry.account,
            openingBalance: 0,
            periodDebit: 0,
            periodCredit: 0,
            closingBalance: 0,
          });
        }

        const account = accountMap.get(entry.account.id);

        if (isBeforePeriod) {
          account.openingBalance += (entry.debit || 0) - (entry.credit || 0);
        }

        if (isInPeriod) {
          account.periodDebit += entry.debit || 0;
          account.periodCredit += entry.credit || 0;
        }
      });

      // Calculate closing balances
      const accounts = Array.from(accountMap.values()).map((account) => ({
        ...account,
        closingBalance:
          account.openingBalance + account.periodDebit - account.periodCredit,
      }));

      // Calculate totals
      const totals = accounts.reduce(
        (acc, account) => ({
          openingDebit: acc.openingDebit + Math.max(0, account.openingBalance),
          openingCredit: acc.openingCredit + Math.abs(Math.min(0, account.openingBalance)),
          periodDebit: acc.periodDebit + account.periodDebit,
          periodCredit: acc.periodCredit + account.periodCredit,
          closingDebit: acc.closingDebit + Math.max(0, account.closingBalance),
          closingCredit: acc.closingCredit + Math.abs(Math.min(0, account.closingBalance)),
        }),
        {
          openingDebit: 0,
          openingCredit: 0,
          periodDebit: 0,
          periodCredit: 0,
          closingDebit: 0,
          closingCredit: 0,
        }
      );

      return {
        accounts: accounts.sort((a, b) => a.code.localeCompare(b.code)),
        totals,
      };
    },
    enabled: !!organization?.id,
  });

  // Check for existing snapshot for this period
  const { data: existingSnapshot } = useQuery({
    queryKey: ["tb-snapshot-current", organization?.id, entity.type, entity.id, periodDates.start.toISOString(), periodDates.end.toISOString()],
    queryFn: async () => {
      if (!organization?.id) return null;

      const query = supabase
        .from("trial_balance_snapshots")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("period_start", periodDates.start.toISOString().split("T")[0])
        .eq("period_end", periodDates.end.toISOString().split("T")[0])
        .neq("status", "superseded")
        .order("created_at", { ascending: false })
        .limit(1);

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!organization?.id,
  });

  const handleSendToWorkpapers = () => {
    if (!existingSnapshot) {
      toast.error("Create a snapshot first", {
        description: "You need to create a TB snapshot before sending to workpapers",
      });
      return;
    }
    toast.success("TB sent to Workpapers", {
      description: "Workpaper creation from TB coming in Phase 3",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Trial Balance</h2>
          <p className="text-sm text-muted-foreground">
            Financial position for {entity.name}
          </p>
        </div>

        <div className="flex gap-4 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="year">Full Year</SelectItem>
                <SelectItem value="quarter">Quarter</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3].map((offset) => (
                  <SelectItem
                    key={currentYear - offset}
                    value={(currentYear - offset).toString()}
                  >
                    {currentYear - offset}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Import TB
        </Button>
        
        <Button 
          variant="outline" 
          onClick={() => setSnapshotDialogOpen(true)}
          disabled={!trialBalance || trialBalance.accounts.length === 0}
        >
          <Camera className="h-4 w-4 mr-2" />
          Create Snapshot
        </Button>

        <SnapshotHistoryPanel entity={entity} />

        <div className="flex-1" />

        {existingSnapshot && (
          <Badge variant="secondary" className="gap-1">
            <Database className="h-3 w-3" />
            Snapshot exists for this period
          </Badge>
        )}

        <Button 
          onClick={handleSendToWorkpapers}
          disabled={!existingSnapshot}
        >
          <FileDown className="h-4 w-4 mr-2" />
          Send to Workpapers
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : !trialBalance || trialBalance.accounts.length === 0 ? (
        <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg">
          <div className="text-center space-y-4">
            <p className="text-lg font-medium">No transactions in this period</p>
            <p className="text-sm text-muted-foreground">
              Post journals or import a trial balance to get started
            </p>
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import Trial Balance
            </Button>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Dr Movement</TableHead>
                <TableHead className="text-right">Cr Movement</TableHead>
                <TableHead className="text-right">Closing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trialBalance.accounts.map((account) => (
                <TableRow key={account.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-mono">{account.code}</TableCell>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {getAccountTypeLabel(account.account_type)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(account.openingBalance)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(account.periodDebit)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(account.periodCredit)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(account.closingBalance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-bold">
                  Totals
                </TableCell>
                <TableCell className="text-right font-mono font-bold">
                  {formatCurrency(
                    trialBalance.totals.openingDebit - trialBalance.totals.openingCredit
                  )}
                </TableCell>
                <TableCell className="text-right font-mono font-bold">
                  {formatCurrency(trialBalance.totals.periodDebit)}
                </TableCell>
                <TableCell className="text-right font-mono font-bold">
                  {formatCurrency(trialBalance.totals.periodCredit)}
                </TableCell>
                <TableCell className="text-right font-mono font-bold">
                  {formatCurrency(
                    trialBalance.totals.closingDebit - trialBalance.totals.closingCredit
                  )}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* Dialogs */}
      <ImportTrialBalanceDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        entity={entity}
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
      />

      <CreateSnapshotDialog
        open={snapshotDialogOpen}
        onOpenChange={setSnapshotDialogOpen}
        entity={entity}
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
        trialBalanceData={trialBalance}
      />
    </div>
  );
}
