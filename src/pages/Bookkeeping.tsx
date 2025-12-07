import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
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
import SalesTab from "@/components/bookkeeping/SalesTab";
import CustomersTab from "@/components/bookkeeping/CustomersTab";
import BillsTab from "@/components/bookkeeping/BillsTab";
import SuppliersTab from "@/components/bookkeeping/SuppliersTab";
import { CreditNotesTab } from "@/components/bookkeeping/CreditNotesTab";
import { BankRulesTab } from "@/components/bookkeeping/BankRulesTab";
import { VATReturnsTab } from "@/components/bookkeeping/VATReturnsTab";
import { PeriodLockTab } from "@/components/bookkeeping/PeriodLockTab";
import { ReceiptsTab } from "@/components/bookkeeping/ReceiptsTab";
import { PayrollModule } from "@/components/payroll/PayrollModule";
import { CISModule } from "@/components/cis/CISModule";
import { useEntityServices } from "@/hooks/useEntityServices";

export default function Bookkeeping() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedEntity, setSelectedEntity] = useState<BookkeepingEntity | null>(null);
  
  // Get initial tab from URL or default to overview
  const initialTab = searchParams.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(initialTab);

  const { hasPayroll, hasCIS, hasBookkeeping, isLoading: servicesLoading } = useEntityServices(
    selectedEntity?.type ?? null,
    selectedEntity?.id ?? null
  );

  // Sync tab changes to URL
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // Reset to overview if current tab becomes unavailable due to entity change
  useEffect(() => {
    if (!servicesLoading && selectedEntity) {
      if (activeTab === 'payroll' && !hasPayroll) {
        handleTabChange('overview');
      }
      if (activeTab === 'cis' && !hasCIS) {
        handleTabChange('overview');
      }
    }
  }, [selectedEntity, hasPayroll, hasCIS, servicesLoading, activeTab]);

  // Check if entity is VAT registered (simplified - you may have more complex logic)
  const isVATRegistered = selectedEntity?.type === 'company'; // Placeholder - should check actual VAT status

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Bookkeeping</h1>
          <p className="text-muted-foreground">
            Manage accounts, ledgers, payroll, and CIS returns
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
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
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
              <TabsTrigger value="general-ledger">General Ledger</TabsTrigger>
              <TabsTrigger value="chart-of-accounts">Chart of Accounts</TabsTrigger>
              <TabsTrigger value="journals">Journals</TabsTrigger>
              <TabsTrigger value="bank-accounts">Bank Accounts</TabsTrigger>
              <TabsTrigger value="bank-feeds">Bank Feeds</TabsTrigger>
              <TabsTrigger value="bank-reconciliation">Bank Reconciliation</TabsTrigger>
              <TabsTrigger value="sales">Sales</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
              <TabsTrigger value="bills">Bills</TabsTrigger>
              <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
              <TabsTrigger value="credit-notes">Credit Notes</TabsTrigger>
              <TabsTrigger value="receipts">Receipts</TabsTrigger>
              <TabsTrigger value="bank-rules">Bank Rules</TabsTrigger>
              {isVATRegistered && (
                <TabsTrigger value="vat-returns">VAT Returns</TabsTrigger>
              )}
              {hasPayroll && (
                <TabsTrigger value="payroll">Payroll</TabsTrigger>
              )}
              {hasCIS && (
                <TabsTrigger value="cis">CIS</TabsTrigger>
              )}
              <TabsTrigger value="period-lock">Period Lock</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <BusinessOverviewTab entity={selectedEntity} onTabChange={handleTabChange} />
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

            <TabsContent value="sales" className="space-y-4">
              <SalesTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="customers" className="space-y-4">
              <CustomersTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="bills" className="space-y-4">
              <BillsTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="suppliers" className="space-y-4">
              <SuppliersTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="credit-notes" className="space-y-4">
              <CreditNotesTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="receipts" className="space-y-4">
              <ReceiptsTab entityType={selectedEntity.type} entityId={selectedEntity.id} />
            </TabsContent>

            <TabsContent value="bank-rules" className="space-y-4">
              <BankRulesTab entity={selectedEntity} />
            </TabsContent>

            {isVATRegistered && (
              <TabsContent value="vat-returns" className="space-y-4">
                <VATReturnsTab entityType={selectedEntity.type} entityId={selectedEntity.id} />
              </TabsContent>
            )}

            {hasPayroll && (
              <TabsContent value="payroll" className="space-y-4">
                <PayrollModule 
                  entityType={selectedEntity.type} 
                  entityId={selectedEntity.id} 
                />
              </TabsContent>
            )}

            {hasCIS && (
              <TabsContent value="cis" className="space-y-4">
                <CISModule 
                  entityType={selectedEntity.type} 
                  entityId={selectedEntity.id} 
                />
              </TabsContent>
            )}

            <TabsContent value="period-lock" className="space-y-4">
              <PeriodLockTab entityType={selectedEntity.type} entityId={selectedEntity.id} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
