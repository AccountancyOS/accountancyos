import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { EntitySelector, BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { CISModule } from "@/components/cis/CISModule";

const CIS = () => {
  const [selectedEntity, setSelectedEntity] = useState<BookkeepingEntity | null>(null);

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

        {/* Entity Selector */}
        <div className="flex items-center gap-4">
          <EntitySelector
            value={selectedEntity}
            onValueChange={setSelectedEntity}
          />
        </div>

        {!selectedEntity ? (
          <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg">
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">No entity selected</p>
              <p className="text-sm text-muted-foreground">
                Select a client or company above to manage their CIS
              </p>
            </div>
          </div>
        ) : (
          <CISModule
            entityType={selectedEntity.type}
            entityId={selectedEntity.id}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default CIS;
