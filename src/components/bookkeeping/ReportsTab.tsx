import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfitLossReport } from "./ProfitLossReport";
import { BalanceSheetReport } from "./BalanceSheetReport";
import { TrialBalanceTab } from "./TrialBalanceTab";
import { GeneralLedgerTab } from "./GeneralLedgerTab";
import { AgedReceivablesReport } from "./AgedReceivablesReport";
import { AgedPayablesReport } from "./AgedPayablesReport";
import type { BookkeepingEntity } from "./EntitySelector";
import { BookkeepingEmptyState } from "./BookkeepingEmptyState";
import { BarChart3 } from "lucide-react";

interface ReportsTabProps {
  entity: BookkeepingEntity | null;
}

export function ReportsTab({ entity }: ReportsTabProps) {
  const [activeReport, setActiveReport] = useState("profit-loss");

  if (!entity) {
    return (
      <BookkeepingEmptyState
        icon={BarChart3}
        title="No entity selected"
        description="Select a client or company above to view financial reports"
      />
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeReport} onValueChange={setActiveReport}>
        <TabsList>
          <TabsTrigger value="profit-loss">Profit & Loss</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
          <TabsTrigger value="aged-debtors">Aged Debtors</TabsTrigger>
          <TabsTrigger value="aged-creditors">Aged Creditors</TabsTrigger>
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
          <TabsTrigger value="general-ledger">General Ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="profit-loss" className="mt-4">
          <ProfitLossReport entity={entity} />
        </TabsContent>

        <TabsContent value="balance-sheet" className="mt-4">
          <BalanceSheetReport entity={entity} />
        </TabsContent>

        <TabsContent value="aged-debtors" className="mt-4">
          <AgedReceivablesReport entity={entity} />
        </TabsContent>

        <TabsContent value="aged-creditors" className="mt-4">
          <AgedPayablesReport entity={entity} />
        </TabsContent>

        <TabsContent value="trial-balance" className="mt-4">
          <TrialBalanceTab entity={entity} />
        </TabsContent>

        <TabsContent value="general-ledger" className="mt-4">
          <GeneralLedgerTab entity={entity} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
