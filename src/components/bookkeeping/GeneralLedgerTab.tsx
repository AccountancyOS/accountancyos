import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { format } from "date-fns";
import { FileText } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LedgerEntryPanel } from "./LedgerEntryPanel";

interface GeneralLedgerTabProps {
  entity: BookkeepingEntity;
}

export function GeneralLedgerTab({ entity }: GeneralLedgerTabProps) {
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const { organization } = useOrganization();

  const { data: entries, isLoading } = useQuery({
    queryKey: [
      "ledger-entries",
      organization?.id,
      entity.type,
      entity.id,
      startDate,
      endDate,
    ],
    queryFn: async () => {
      if (!organization?.id) return [];

      const query = supabase
        .from("ledger_entries")
        .select(`
          *,
          account:bookkeeping_accounts(code, name, account_type)
        `)
        .eq("organization_id", organization.id)
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">General Ledger</h2>
          <p className="text-sm text-muted-foreground">
            All transactions for {entity.name}
          </p>
        </div>

        <div className="flex gap-4">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[150px]"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div>Loading entries...</div>
      ) : !entries || entries.length === 0 ? (
        <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">No transactions yet</p>
            <p className="text-sm text-muted-foreground">
              Transactions will appear here once journals are posted
            </p>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-center">Doc</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow
                  key={entry.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedEntry(entry)}
                >
                  <TableCell>
                    {format(new Date(entry.transaction_date), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-mono text-sm">{entry.account.code}</div>
                      <div className="text-xs text-muted-foreground">
                        {entry.account.name}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{entry.description || "—"}</TableCell>
                  <TableCell className="text-right font-mono">
                    {entry.debit ? formatCurrency(entry.debit) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {entry.credit ? formatCurrency(entry.credit) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {entry.source_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {entry.document_id && (
                      <FileText className="h-4 w-4 inline text-muted-foreground" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <LedgerEntryPanel
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </div>
  );
}
