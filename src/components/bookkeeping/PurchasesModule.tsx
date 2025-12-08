import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BillsTab from "./BillsTab";
import SuppliersTab from "./SuppliersTab";
import { CreditNotesTab } from "./CreditNotesTab";
import { AgedPayablesReport } from "./AgedPayablesReport";
import type { BookkeepingEntity } from "./EntitySelector";

interface PurchasesModuleProps {
  entity: BookkeepingEntity | null;
}

export function PurchasesModule({ entity }: PurchasesModuleProps) {
  const [activeSubTab, setActiveSubTab] = useState("bills");

  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="credit-notes">Credit Notes</TabsTrigger>
          <TabsTrigger value="aged-payables">Aged Payables</TabsTrigger>
        </TabsList>

        <TabsContent value="bills" className="mt-4">
          <BillsTab entity={entity} />
        </TabsContent>

        <TabsContent value="suppliers" className="mt-4">
          <SuppliersTab entity={entity} />
        </TabsContent>

        <TabsContent value="credit-notes" className="mt-4">
          <PurchaseCreditNotesWrapper entity={entity} />
        </TabsContent>

        <TabsContent value="aged-payables" className="mt-4">
          {entity && (
            <AgedPayablesReport entity={entity} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Wrapper to filter credit notes to PURCHASE type only
function PurchaseCreditNotesWrapper({ entity }: { entity: BookkeepingEntity | null }) {
  return <CreditNotesTab entity={entity} defaultType="purchase" />;
}
