import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SalesTab from "./SalesTab";
import CustomersTab from "./CustomersTab";
import { CreditNotesTab } from "./CreditNotesTab";
import { AgedReceivablesReport } from "./AgedReceivablesReport";
import type { BookkeepingEntity } from "./EntitySelector";

interface SalesModuleProps {
  entity: BookkeepingEntity | null;
  /** Portal permission gates (default true = accountant app). */
  canCreate?: boolean;
  canSend?: boolean;
}

export function SalesModule({ entity, canCreate = true, canSend = true }: SalesModuleProps) {
  const [activeSubTab, setActiveSubTab] = useState("invoices");

  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="credit-notes">Credit Notes</TabsTrigger>
          <TabsTrigger value="aged-receivables">Aged Receivables</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          <SalesTab entity={entity} canCreate={canCreate} canSend={canSend} />
        </TabsContent>

        <TabsContent value="customers" className="mt-4">
          <CustomersTab entity={entity} />
        </TabsContent>

        <TabsContent value="credit-notes" className="mt-4">
          <SalesCreditNotesWrapper entity={entity} />
        </TabsContent>

        <TabsContent value="aged-receivables" className="mt-4">
          {entity && (
            <AgedReceivablesReport entity={entity} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Wrapper to filter credit notes to SALES type only
function SalesCreditNotesWrapper({ entity }: { entity: BookkeepingEntity | null }) {
  return <CreditNotesTab entity={entity} defaultType="sales" />;
}
