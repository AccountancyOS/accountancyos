import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntitySelector, type BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { BusinessOverviewTab } from "@/components/bookkeeping/BusinessOverviewTab";
import { ChartOfAccountsTab } from "@/components/bookkeeping/ChartOfAccountsTab";
import { GeneralLedgerTab } from "@/components/bookkeeping/GeneralLedgerTab";
import { TrialBalanceTab } from "@/components/bookkeeping/TrialBalanceTab";
import { JournalsTab } from "@/components/bookkeeping/JournalsTab";
import { BankAccountsTab } from "@/components/bookkeeping/BankAccountsTab";
import { BankFeedsTab } from "@/components/bookkeeping/BankFeedsTab";
import { BankReconciliationTab } from "@/components/bookkeeping/BankReconciliationTab";
import { InvoicesTab } from "@/components/bookkeeping/InvoicesTab";
import { VATReturnsTab } from "@/components/bookkeeping/VATReturnsTab";
import { PeriodLockTab } from "@/components/bookkeeping/PeriodLockTab";
import { ReceiptsTab } from "@/components/bookkeeping/ReceiptsTab";

export default function Bookkeeping() {
  const [selectedEntity, setSelectedEntity] = useState<BookkeepingEntity | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
              <TabsTrigger value="general-ledger">General Ledger</TabsTrigger>
              <TabsTrigger value="chart-of-accounts">Chart of Accounts</TabsTrigger>
              <TabsTrigger value="journals">Journals</TabsTrigger>
              <TabsTrigger value="bank-accounts">Bank Accounts</TabsTrigger>
              <TabsTrigger value="bank-feeds">Bank Feeds</TabsTrigger>
              <TabsTrigger value="bank-reconciliation">Bank Reconciliation</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="receipts">Receipts</TabsTrigger>
              <TabsTrigger value="vat-returns">VAT Returns</TabsTrigger>
              <TabsTrigger value="period-lock">Period Lock</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <BusinessOverviewTab entity={selectedEntity} onTabChange={setActiveTab} />
            </TabsContent>

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

            <TabsContent value="bank-accounts" className="space-y-4">
              <BankAccountsTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="bank-feeds" className="space-y-4">
              <BankFeedsTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="bank-reconciliation" className="space-y-4">
              <BankReconciliationTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="invoices" className="space-y-4">
              <InvoicesTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="receipts" className="space-y-4">
              <ReceiptsTab entityType={selectedEntity.type} entityId={selectedEntity.id} />
            </TabsContent>

            <TabsContent value="vat-returns" className="space-y-4">
              <VATReturnsTab entityType={selectedEntity.type} entityId={selectedEntity.id} />
            </TabsContent>

            <TabsContent value="period-lock" className="space-y-4">
              <PeriodLockTab entityType={selectedEntity.type} entityId={selectedEntity.id} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
