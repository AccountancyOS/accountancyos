import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntitySelector, BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { CISContractorsTab } from "@/components/cis/CISContractorsTab";
import { CISSubcontractorsTab } from "@/components/cis/CISSubcontractorsTab";
import { CISPaymentsTab } from "@/components/cis/CISPaymentsTab";
import { CISReturnsTab } from "@/components/cis/CISReturnsTab";
import { 
  Building2, 
  Users, 
  CreditCard, 
  FileText
} from "lucide-react";

const CIS = () => {
  const [selectedEntity, setSelectedEntity] = useState<BookkeepingEntity | null>(null);
  const [activeTab, setActiveTab] = useState("contractors");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">CIS</h1>
            <p className="text-sm text-muted-foreground">
              Construction Industry Scheme - Manage contractors, subcontractors, and monthly returns
            </p>
          </div>
        </div>

        {/* Entity Filter */}
        <div className="flex items-center gap-4">
          <EntitySelector
            value={selectedEntity}
            onValueChange={setSelectedEntity}
          />
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto flex-wrap sm:flex-nowrap w-full sm:w-auto sm:inline-flex gap-1">
            <TabsTrigger value="contractors" className="flex items-center gap-2 flex-1 sm:flex-initial">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Contractors</span>
            </TabsTrigger>
            <TabsTrigger value="subcontractors" className="flex items-center gap-2 flex-1 sm:flex-initial">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Subcontractors</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-2 flex-1 sm:flex-initial">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Payments</span>
            </TabsTrigger>
            <TabsTrigger value="returns" className="flex items-center gap-2 flex-1 sm:flex-initial">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Returns</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contractors" className="mt-6">
            <CISContractorsTab selectedEntity={selectedEntity} />
          </TabsContent>

          <TabsContent value="subcontractors" className="mt-6">
            <CISSubcontractorsTab selectedEntity={selectedEntity} />
          </TabsContent>

          <TabsContent value="payments" className="mt-6">
            <CISPaymentsTab selectedEntity={selectedEntity} />
          </TabsContent>

          <TabsContent value="returns" className="mt-6">
            <CISReturnsTab selectedEntity={selectedEntity} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default CIS;
