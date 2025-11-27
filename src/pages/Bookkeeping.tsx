import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntitySelector, type BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { ChartOfAccountsTab } from "@/components/bookkeeping/ChartOfAccountsTab";
import { GeneralLedgerTab } from "@/components/bookkeeping/GeneralLedgerTab";
import { TrialBalanceTab } from "@/components/bookkeeping/TrialBalanceTab";
import { JournalsTab } from "@/components/bookkeeping/JournalsTab";

export default function Bookkeeping() {
  const [selectedEntity, setSelectedEntity] = useState<BookkeepingEntity | null>(null);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Bookkeeping</h1>
          <p className="text-muted-foreground">
            Manage accounts, ledgers, and financial records
          </p>
        </div>

        <div className="flex items-center gap-4">
          <EntitySelector value={selectedEntity} onValueChange={setSelectedEntity} />
        </div>

        {!selectedEntity ? (
          <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg">
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">No entity selected</p>
              <p className="text-sm text-muted-foreground">
                Select a client or company above to view their books
              </p>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="trial-balance" className="space-y-4">
            <TabsList>
              <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
              <TabsTrigger value="general-ledger">General Ledger</TabsTrigger>
              <TabsTrigger value="chart-of-accounts">Chart of Accounts</TabsTrigger>
              <TabsTrigger value="journals">Journals</TabsTrigger>
            </TabsList>

            <TabsContent value="trial-balance" className="space-y-4">
              <TrialBalanceTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="general-ledger" className="space-y-4">
              <GeneralLedgerTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="chart-of-accounts" className="space-y-4">
              <ChartOfAccountsTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="journals" className="space-y-4">
              <JournalsTab entity={selectedEntity} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
