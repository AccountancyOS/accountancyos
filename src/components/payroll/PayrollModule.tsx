import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PayeSchemesTab } from "@/components/payroll/PayeSchemesTab";
import { PayrollEmployeesTab } from "@/components/payroll/PayrollEmployeesTab";
import { PayRunsTab } from "@/components/payroll/PayRunsTab";
import { RTISubmissionsTab } from "@/components/payroll/RTISubmissionsTab";
import { PayslipsTab } from "@/components/payroll/PayslipsTab";
import { PayrollOverviewTab } from "@/components/payroll/PayrollOverviewTab";
import { PayeSchemeSelector } from "@/components/payroll/PayeSchemeSelector";
import { getTaxYears, getCurrentTaxYear } from "@/lib/payroll-constants";
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  Calendar, 
  FileText,
  Receipt
} from "lucide-react";

interface PayrollModuleProps {
  entityType: 'client' | 'company';
  entityId: string;
  taxYear?: string;
}

export function PayrollModule({ entityType, entityId, taxYear: initialTaxYear }: PayrollModuleProps) {
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [selectedTaxYear, setSelectedTaxYear] = useState<string>(initialTaxYear || getCurrentTaxYear());
  const [activeTab, setActiveTab] = useState("overview");

  const taxYears = getTaxYears(5);

  // Create entity object for compatibility with existing components
  const selectedEntity = { type: entityType, id: entityId, name: "", displayName: "" };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <PayeSchemeSelector
          entityType={entityType}
          entityId={entityId}
          value={selectedSchemeId}
          onValueChange={setSelectedSchemeId}
        />

        <Select value={selectedTaxYear} onValueChange={setSelectedTaxYear}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Tax Year" />
          </SelectTrigger>
          <SelectContent>
            {taxYears.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto flex-wrap sm:flex-nowrap w-full sm:w-auto sm:inline-flex gap-1">
          <TabsTrigger value="overview" className="flex items-center gap-2 flex-1 sm:flex-initial">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="paye-schemes" className="flex items-center gap-2 flex-1 sm:flex-initial">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">PAYE Schemes</span>
          </TabsTrigger>
          <TabsTrigger value="employees" className="flex items-center gap-2 flex-1 sm:flex-initial">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Employees</span>
          </TabsTrigger>
          <TabsTrigger value="pay-runs" className="flex items-center gap-2 flex-1 sm:flex-initial">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Pay Runs</span>
          </TabsTrigger>
          <TabsTrigger value="rti-submissions" className="flex items-center gap-2 flex-1 sm:flex-initial">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">RTI Submissions</span>
          </TabsTrigger>
          <TabsTrigger value="payslips" className="flex items-center gap-2 flex-1 sm:flex-initial">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Payslips</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <PayrollOverviewTab 
            selectedEntity={selectedEntity}
            selectedSchemeId={selectedSchemeId}
            taxYear={selectedTaxYear}
            onNavigate={setActiveTab}
          />
        </TabsContent>

        <TabsContent value="paye-schemes" className="mt-6">
          <PayeSchemesTab 
            selectedEntity={selectedEntity}
          />
        </TabsContent>

        <TabsContent value="employees" className="mt-6">
          <PayrollEmployeesTab 
            selectedEntity={selectedEntity}
            selectedSchemeId={selectedSchemeId}
          />
        </TabsContent>

        <TabsContent value="pay-runs" className="mt-6">
          <PayRunsTab 
            selectedEntity={selectedEntity}
            selectedSchemeId={selectedSchemeId}
            taxYear={selectedTaxYear}
          />
        </TabsContent>

        <TabsContent value="rti-submissions" className="mt-6">
          <RTISubmissionsTab 
            selectedEntity={selectedEntity}
            selectedSchemeId={selectedSchemeId}
            taxYear={selectedTaxYear}
          />
        </TabsContent>

        <TabsContent value="payslips" className="mt-6">
          <PayslipsTab 
            selectedEntity={selectedEntity}
            selectedSchemeId={selectedSchemeId}
            taxYear={selectedTaxYear}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
