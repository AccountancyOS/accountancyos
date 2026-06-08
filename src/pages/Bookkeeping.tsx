import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntitySelector, type BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { BusinessOverviewTab } from "@/components/bookkeeping/BusinessOverviewTab";
import { ChartOfAccountsTab } from "@/components/bookkeeping/ChartOfAccountsTab";
import { JournalsTab } from "@/components/bookkeeping/JournalsTab";
import { BankingTab } from "@/components/bookkeeping/BankingTab";
import { SalesModule } from "@/components/bookkeeping/SalesModule";
import { PurchasesModule } from "@/components/bookkeeping/PurchasesModule";
import { BankRulesTab } from "@/components/bookkeeping/BankRulesTab";
import { ReportsTab } from "@/components/bookkeeping/ReportsTab";
import { VATReturnsTab } from "@/components/bookkeeping/VATReturnsTab";
import { PeriodLockTab } from "@/components/bookkeeping/PeriodLockTab";
import { ReceiptsTab } from "@/components/bookkeeping/ReceiptsTab";
import { COATaxMappingEditor } from "@/components/bookkeeping/COATaxMappingEditor";
import { ReviewQueueTab } from "@/components/bookkeeping/ReviewQueueTab";
import { PayrollModule } from "@/components/payroll/PayrollModule";
import { CISModule } from "@/components/cis/CISModule";
import { PracticeBankingOverview } from "@/components/bookkeeping/PracticeBankingOverview";
import { useEntityServices } from "@/hooks/useEntityServices";
import { Separator } from "@/components/ui/separator";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

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
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Bookkeeping</h1>
          <p className="text-muted-foreground mt-1">
            Manage accounts, ledgers, payroll, and CIS returns
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <EntitySelector value={selectedEntity} onValueChange={setSelectedEntity} />
        </div>

        {!selectedEntity ? (
          <div className="space-y-6">
            <PracticeBankingOverview />
            <div className="flex items-center justify-center h-[300px] border border-dashed rounded-lg">
              <div className="text-center space-y-2">
                <p className="text-lg font-medium">No entity selected</p>
                <p className="text-sm text-muted-foreground">
                  Select a client or company above to view their books
                </p>
              </div>
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
            <div className="relative">
              <ScrollArea className="w-full whitespace-nowrap pb-2">
                <TabsList className="inline-flex h-auto p-1 gap-0.5">
                  {/* Core Group */}
                  <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
                  <TabsTrigger value="reports" className="text-xs sm:text-sm">Reports</TabsTrigger>
                  <TabsTrigger value="chart-of-accounts" className="text-xs sm:text-sm">Chart of Accounts</TabsTrigger>
                  <TabsTrigger value="tax-mapping" className="text-xs sm:text-sm">Tax Mapping</TabsTrigger>
                  <TabsTrigger value="journals" className="text-xs sm:text-sm">Journals</TabsTrigger>
                  
                  <Separator orientation="vertical" className="mx-1 h-6" />
                  
                  {/* Banking Group */}
                  <TabsTrigger value="banking" className="text-xs sm:text-sm">Banking</TabsTrigger>
                  <TabsTrigger value="bank-rules" className="text-xs sm:text-sm">Bank Rules</TabsTrigger>
                  
                  <Separator orientation="vertical" className="mx-1 h-6" />
                  
                  {/* AR/AP Group */}
                  <TabsTrigger value="sales" className="text-xs sm:text-sm">Sales</TabsTrigger>
                  <TabsTrigger value="purchases" className="text-xs sm:text-sm">Purchases</TabsTrigger>
                  
                  <Separator orientation="vertical" className="mx-1 h-6" />
                  
                  {/* Operations Group */}
                  <TabsTrigger value="receipts" className="text-xs sm:text-sm">Receipts</TabsTrigger>
                  {isVATRegistered && (
                    <TabsTrigger value="vat-returns" className="text-xs sm:text-sm">VAT Returns</TabsTrigger>
                  )}
                  {hasPayroll && (
                    <TabsTrigger value="payroll" className="text-xs sm:text-sm">Payroll</TabsTrigger>
                  )}
                  {hasCIS && (
                    <TabsTrigger value="cis" className="text-xs sm:text-sm">CIS</TabsTrigger>
                  )}
                  <TabsTrigger value="period-lock" className="text-xs sm:text-sm">Period Lock</TabsTrigger>
                  <Separator orientation="vertical" className="mx-1 h-6" />
                  <TabsTrigger value="review-queue" className="text-xs sm:text-sm">Review Queue</TabsTrigger>
                </TabsList>
                <ScrollBar orientation="horizontal" className="h-2.5 mt-1" />
              </ScrollArea>
              {/* Fade indicators for scroll */}
              <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent" />
            </div>

            <TabsContent value="overview" className="space-y-4">
              <BusinessOverviewTab entity={selectedEntity} onTabChange={handleTabChange} />
            </TabsContent>

            <TabsContent value="reports" className="space-y-4">
              <ReportsTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="chart-of-accounts" className="space-y-4">
              <ChartOfAccountsTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="tax-mapping" className="space-y-4">
              <COATaxMappingEditor entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="journals" className="space-y-4">
              <JournalsTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="banking" className="space-y-4">
              <BankingTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="bank-rules" className="space-y-4">
              <BankRulesTab entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="sales" className="space-y-4">
              <SalesModule entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="purchases" className="space-y-4">
              <PurchasesModule entity={selectedEntity} />
            </TabsContent>

            <TabsContent value="receipts" className="space-y-4">
              <ReceiptsTab entityType={selectedEntity.type} entityId={selectedEntity.id} />
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

            <TabsContent value="review-queue" className="space-y-4">
              <ReviewQueueTab entity={selectedEntity} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
