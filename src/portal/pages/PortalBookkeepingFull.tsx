import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { BusinessOverviewTab } from "@/components/bookkeeping/BusinessOverviewTab";
import { ChartOfAccountsTab } from "@/components/bookkeeping/ChartOfAccountsTab";
import { JournalsTab } from "@/components/bookkeeping/JournalsTab";
import { BankingTab } from "@/components/bookkeeping/BankingTab";
import { SalesModule } from "@/components/bookkeeping/SalesModule";
import { PurchasesModule } from "@/components/bookkeeping/PurchasesModule";
import { BankRulesTab } from "@/components/bookkeeping/BankRulesTab";
import { ReportsTab } from "@/components/bookkeeping/ReportsTab";
import { VATReturnsTab } from "@/components/bookkeeping/VATReturnsTab";
import { ReceiptsTab } from "@/components/bookkeeping/ReceiptsTab";
import type { BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { usePortalEntity } from "../contexts/PortalEntityContext";
import { PortalAppShim } from "../contexts/PortalAppShim";
import { PortalPageHeader } from "../components/PortalPageHeader";

/**
 * Full bookkeeping module inside the client portal. Reuses the accountant-side
 * bookkeeping components by wrapping them in PortalAppShim, which provides a
 * minimal AppContext (org id, user, session) those components require.
 *
 * Tabs hidden vs accountant view: Tax Mapping, Period Lock, Payroll, CIS.
 * All RLS gating is server-side via the `portal_can_access_bookkeeping`
 * helper used in policies on every bookkeeping table.
 */
function PortalBookkeepingFullInner() {
  const { currentEntity } = usePortalEntity();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const entity: BookkeepingEntity | null = useMemo(() => {
    if (!currentEntity) return null;
    return {
      type: currentEntity.type,
      id: currentEntity.id,
      name: currentEntity.displayName,
      displayName: currentEntity.displayName,
    };
  }, [currentEntity]);

  // VAT visibility — treat company entities as potentially VAT-registered.
  const isVATRegistered = currentEntity?.type === "company";

  useEffect(() => {
    // No payroll/CIS tabs in portal — nothing to reset.
  }, [entity?.id]);

  if (!entity) {
    return (
      <div className="p-6 space-y-6">
        <PortalPageHeader title="Bookkeeping" description="Manage your accounts, bank feeds, and invoices." />
        <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground">Select an entity to view its bookkeeping.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader
        title="Bookkeeping"
        description={`Manage accounts, bank feeds, invoices, and bills for ${entity.displayName}.`}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <div className="relative">
          <ScrollArea className="w-full whitespace-nowrap pb-2">
            <TabsList className="inline-flex h-auto p-1 gap-0.5">
              <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
              <TabsTrigger value="reports" className="text-xs sm:text-sm">Reports</TabsTrigger>
              <TabsTrigger value="chart-of-accounts" className="text-xs sm:text-sm">Chart of Accounts</TabsTrigger>
              <TabsTrigger value="journals" className="text-xs sm:text-sm">Journals</TabsTrigger>
              <Separator orientation="vertical" className="mx-1 h-6" />
              <TabsTrigger value="banking" className="text-xs sm:text-sm">Banking</TabsTrigger>
              <TabsTrigger value="bank-rules" className="text-xs sm:text-sm">Bank Rules</TabsTrigger>
              <Separator orientation="vertical" className="mx-1 h-6" />
              <TabsTrigger value="sales" className="text-xs sm:text-sm">Sales</TabsTrigger>
              <TabsTrigger value="purchases" className="text-xs sm:text-sm">Purchases</TabsTrigger>
              <Separator orientation="vertical" className="mx-1 h-6" />
              <TabsTrigger value="receipts" className="text-xs sm:text-sm">Receipts</TabsTrigger>
              {isVATRegistered && (
                <TabsTrigger value="vat-returns" className="text-xs sm:text-sm">VAT Returns</TabsTrigger>
              )}
            </TabsList>
            <ScrollBar orientation="horizontal" className="h-2.5 mt-1" />
          </ScrollArea>
          <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent" />
        </div>

        <TabsContent value="overview" className="space-y-4">
          <BusinessOverviewTab entity={entity} onTabChange={handleTabChange} />
        </TabsContent>
        <TabsContent value="reports" className="space-y-4">
          <ReportsTab entity={entity} />
        </TabsContent>
        <TabsContent value="chart-of-accounts" className="space-y-4">
          <ChartOfAccountsTab entity={entity} />
        </TabsContent>
        <TabsContent value="journals" className="space-y-4">
          <JournalsTab entity={entity} />
        </TabsContent>
        <TabsContent value="banking" className="space-y-4">
          <BankingTab entity={entity} />
        </TabsContent>
        <TabsContent value="bank-rules" className="space-y-4">
          <BankRulesTab entity={entity} />
        </TabsContent>
        <TabsContent value="sales" className="space-y-4">
          <SalesModule entity={entity} />
        </TabsContent>
        <TabsContent value="purchases" className="space-y-4">
          <PurchasesModule entity={entity} />
        </TabsContent>
        <TabsContent value="receipts" className="space-y-4">
          <ReceiptsTab entityType={entity.type} entityId={entity.id} />
        </TabsContent>
        {isVATRegistered && (
          <TabsContent value="vat-returns" className="space-y-4">
            <VATReturnsTab entityType={entity.type} entityId={entity.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default function PortalBookkeepingFull() {
  return (
    <PortalAppShim>
      <PortalBookkeepingFullInner />
    </PortalAppShim>
  );
}