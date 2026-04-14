import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible";
import { 
  Download, 
  ChevronDown, 
  ChevronRight,
  FileText,
  Database,
  GitBranch,
  Shield,
  Zap,
  Code,
  AlertTriangle,
  Link2,
  LayoutDashboard,
  ArrowLeft
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// Print-optimized styles
const printStyles = `
@media print {
  @page {
    size: A4;
    margin: 20mm;
  }
  
  body {
    font-size: 10pt;
    line-height: 1.4;
  }
  
  .no-print {
    display: none !important;
  }
  
  .print-break-before {
    page-break-before: always;
  }
  
  .print-break-after {
    page-break-after: always;
  }
  
  .print-avoid-break {
    page-break-inside: avoid;
  }
  
  table {
    font-size: 9pt;
  }
  
  h1 { font-size: 18pt; }
  h2 { font-size: 14pt; margin-top: 16pt; }
  h3 { font-size: 12pt; margin-top: 12pt; }
  
  .spec-section {
    margin-bottom: 16pt;
  }
}
`;

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  sectionNumber: number;
}

const Section = ({ title, icon, children, defaultOpen = false, sectionNumber }: SectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="spec-section print-avoid-break mb-6">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-3 p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors no-print">
            {isOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            <span className="flex items-center gap-2 text-lg font-semibold">
              {icon}
              {sectionNumber}. {title}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          {children}
        </CollapsibleContent>
        {/* Print version - always visible */}
        <div className="hidden print:block mt-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            {icon}
            {sectionNumber}. {title}
          </h2>
          {children}
        </div>
      </Collapsible>
    </div>
  );
};

const TableWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-x-auto print-avoid-break">
    <table className="w-full text-sm border-collapse">
      {children}
    </table>
  </div>
);

export default function SystemSpecification() {
  const navigate = useNavigate();
  
  const handleDownloadPDF = () => {
    window.print();
  };

  const handleDownloadMarkdown = async () => {
    try {
      const response = await fetch('/docs/master-system-specification.md');
      const text = await response.text();
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'AccountancyOS-System-Specification.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download:', error);
    }
  };

  return (
    <>
      <style>{printStyles}</style>
      
      <div className="min-h-screen bg-background">
        {/* Header - hidden in print */}
        <div className="sticky top-0 z-10 bg-background border-b no-print">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">System Specification</h1>
                <p className="text-sm text-muted-foreground">AccountancyOS Master Documentation</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDownloadMarkdown} className="gap-2">
                <FileText className="h-4 w-4" />
                Download .md
              </Button>
              <Button onClick={handleDownloadPDF} className="gap-2">
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-8">
          {/* Title Page */}
          <div className="text-center mb-12 print-break-after">
            <h1 className="text-4xl font-bold mb-4">AccountancyOS</h1>
            <h2 className="text-2xl text-muted-foreground mb-6">Master System Specification (As-Built)</h2>
            <div className="flex justify-center gap-4 mb-8">
              <Badge variant="outline">Version 1.0</Badge>
              <Badge variant="outline">February 2026</Badge>
              <Badge variant="secondary">Internal Documentation</Badge>
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Comprehensive product and system specification covering application structure, 
              database schema, data lineage, integrations, workflows, and permissions.
            </p>
          </div>

          {/* Table of Contents */}
          <Card className="mb-8 no-print">
            <CardHeader>
              <CardTitle className="text-lg">Table of Contents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-2 text-sm">
                {[
                  { num: 1, title: "Application Surface Area", icon: <LayoutDashboard className="h-4 w-4" /> },
                  { num: 2, title: "Page-Level Specification", icon: <FileText className="h-4 w-4" /> },
                  { num: 3, title: "Database Entity Map", icon: <Database className="h-4 w-4" /> },
                  { num: 4, title: "Data Lineage", icon: <GitBranch className="h-4 w-4" /> },
                  { num: 5, title: "Integrations", icon: <Link2 className="h-4 w-4" /> },
                  { num: 6, title: "Workflows & State Machines", icon: <GitBranch className="h-4 w-4" /> },
                  { num: 7, title: "Permissions & Access Control", icon: <Shield className="h-4 w-4" /> },
                  { num: 8, title: "Edge Functions Inventory", icon: <Zap className="h-4 w-4" /> },
                  { num: 9, title: "Technical Architecture", icon: <Code className="h-4 w-4" /> },
                  { num: 10, title: "Known Gaps & TODOs", icon: <AlertTriangle className="h-4 w-4" /> },
                ].map((item) => (
                  <div key={item.num} className="flex items-center gap-2 p-2 hover:bg-muted rounded">
                    {item.icon}
                    <span>{item.num}. {item.title}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Section 1: Application Surface Area */}
          <Section 
            sectionNumber={1}
            title="Application Surface Area" 
            icon={<LayoutDashboard className="h-5 w-5" />}
            defaultOpen={true}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Route Inventory (43 Routes)</CardTitle>
              </CardHeader>
              <CardContent>
                <h4 className="font-semibold mb-3">Core Routes</h4>
                <TableWrapper>
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Route</th>
                      <th className="text-left p-2">Page</th>
                      <th className="text-left p-2">Auth</th>
                      <th className="text-left p-2">Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/</td><td className="p-2">Index</td><td className="p-2">Yes</td><td className="p-2">Dashboard redirect</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/auth</td><td className="p-2">Auth</td><td className="p-2">No</td><td className="p-2">Login/signup</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/overview</td><td className="p-2">Overview</td><td className="p-2">Yes</td><td className="p-2">Practice dashboard</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/clients</td><td className="p-2">Clients</td><td className="p-2">Yes</td><td className="p-2">Client list</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/clients/:id</td><td className="p-2">ClientPortal</td><td className="p-2">Yes</td><td className="p-2">Client detail</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/companies/:id</td><td className="p-2">CompanyDetail</td><td className="p-2">Yes</td><td className="p-2">Company view</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/jobs</td><td className="p-2">Jobs</td><td className="p-2">Yes</td><td className="p-2">Job list</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/jobs/:id</td><td className="p-2">JobDetail</td><td className="p-2">Yes</td><td className="p-2">Job workspace</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/deadlines</td><td className="p-2">Deadlines</td><td className="p-2">Yes</td><td className="p-2">Deadline calendar</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/filings</td><td className="p-2">Filings</td><td className="p-2">Yes</td><td className="p-2">Filing queue</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/bookkeeping</td><td className="p-2">Bookkeeping</td><td className="p-2">Yes</td><td className="p-2">Full bookkeeping</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/payroll</td><td className="p-2">Payroll</td><td className="p-2">Yes</td><td className="p-2">Payroll module</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/cis</td><td className="p-2">CIS</td><td className="p-2">Yes</td><td className="p-2">CIS module</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/emails</td><td className="p-2">Emails</td><td className="p-2">Yes</td><td className="p-2">Email inbox</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">/settings</td><td className="p-2">Settings</td><td className="p-2">Yes</td><td className="p-2">Practice settings</td></tr>
                  </tbody>
                </TableWrapper>
              </CardContent>
            </Card>
          </Section>

          {/* Section 2: Page-Level Specification */}
          <Section 
            sectionNumber={2}
            title="Page-Level Specification" 
            icon={<FileText className="h-5 w-5" />}
          >
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Overview Page (/overview)</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  <p><strong>Purpose:</strong> Practice-wide dashboard with KPIs, pending actions, and pipeline status.</p>
                  <p><strong>Access:</strong> All authenticated users (viewer has read-only)</p>
                  <p><strong>Entry Points:</strong> Sidebar navigation, logo click</p>
                  <p><strong>Key Components:</strong> DashboardKPICards, DeadlineWidget, JobPipelineChart, OverdueActionsPanel</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Bookkeeping Page (/bookkeeping)</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  <p><strong>Purpose:</strong> Full double-entry bookkeeping system with 14 sub-modules.</p>
                  <p><strong>Tabs:</strong> Overview, Banking, Sales, Bills, Customers, Suppliers, Journals, Chart of Accounts, General Ledger, Trial Balance, Reports, VAT Returns, Bank Rules, Period Lock</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Jobs Page (/jobs)</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  <p><strong>Purpose:</strong> Central hub for managing all client work items.</p>
                  <p><strong>Components:</strong> JobsQuickFilters, SavedViewsDropdown, CreateJobDialog</p>
                  <p><strong>State Management:</strong> URL parameters for filters, useJobFilters hook</p>
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* Section 3: Database Entity Map */}
          <Section 
            sectionNumber={3}
            title="Database Entity Map" 
            icon={<Database className="h-5 w-5" />}
          >
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Table Summary (100+ tables)</CardTitle>
                </CardHeader>
                <CardContent>
                  <TableWrapper>
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Domain</th>
                        <th className="text-left p-2">Tables</th>
                        <th className="text-left p-2">Key Examples</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b"><td className="p-2">Core Entities</td><td className="p-2">7</td><td className="p-2 text-xs">organizations, clients, companies, leads</td></tr>
                      <tr className="border-b"><td className="p-2">Client Details</td><td className="p-2">5</td><td className="p-2 text-xs">client_detail_sa, client_detail_charity</td></tr>
                      <tr className="border-b"><td className="p-2">Company Secretary</td><td className="p-2">8</td><td className="p-2 text-xs">company_officers, share_classes, company_pscs</td></tr>
                      <tr className="border-b"><td className="p-2">Jobs & Workflow</td><td className="p-2">8</td><td className="p-2 text-xs">jobs, job_tasks, deadlines</td></tr>
                      <tr className="border-b"><td className="p-2">Bookkeeping</td><td className="p-2">25+</td><td className="p-2 text-xs">invoices, bills, ledger_entries, bank_transactions</td></tr>
                      <tr className="border-b"><td className="p-2">Filing & Tax</td><td className="p-2">12+</td><td className="p-2 text-xs">filings, filing_submissions, ct_computation_snapshots</td></tr>
                      <tr className="border-b"><td className="p-2">Payroll</td><td className="p-2">10+</td><td className="p-2 text-xs">employees, pay_runs, rti_submissions</td></tr>
                      <tr className="border-b"><td className="p-2">CIS</td><td className="p-2">4</td><td className="p-2 text-xs">cis_contractors, cis_subcontractors, cis_payments</td></tr>
                      <tr className="border-b"><td className="p-2">Email & Comms</td><td className="p-2">8</td><td className="p-2 text-xs">email_messages, connected_mailboxes</td></tr>
                      <tr className="border-b"><td className="p-2">Automation</td><td className="p-2">6</td><td className="p-2 text-xs">automation_rules, automation_executions</td></tr>
                    </tbody>
                  </TableWrapper>
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* Section 4: Data Lineage */}
          <Section 
            sectionNumber={4}
            title="Data Lineage" 
            icon={<GitBranch className="h-5 w-5" />}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Companies Table - Field Sources</CardTitle>
              </CardHeader>
              <CardContent>
                <TableWrapper>
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Field</th>
                      <th className="text-left p-2">Source</th>
                      <th className="text-left p-2">Sync Method</th>
                      <th className="text-left p-2">Editable</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">company_name</td><td className="p-2">User / CH API</td><td className="p-2">CH sync</td><td className="p-2">Yes</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">company_number</td><td className="p-2">User / CH lookup</td><td className="p-2">CH sync</td><td className="p-2">Before sync</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">sic_codes</td><td className="p-2">CH API</td><td className="p-2">CH sync</td><td className="p-2">No</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">registered_office</td><td className="p-2">CH API</td><td className="p-2">CH sync</td><td className="p-2">No</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">utr</td><td className="p-2">User input</td><td className="p-2">Manual</td><td className="p-2">Yes</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">vat_number</td><td className="p-2">User input</td><td className="p-2">Manual</td><td className="p-2">Yes</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono text-xs">aml_verified_at</td><td className="p-2">System</td><td className="p-2">On verification</td><td className="p-2">No</td></tr>
                  </tbody>
                </TableWrapper>
              </CardContent>
            </Card>
          </Section>

          {/* Section 5: Integrations */}
          <Section 
            sectionNumber={5}
            title="Integrations" 
            icon={<Link2 className="h-5 w-5" />}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Integration Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <TableWrapper>
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Provider</th>
                      <th className="text-left p-2">Purpose</th>
                      <th className="text-left p-2">Auth</th>
                      <th className="text-left p-2">Edge Functions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b"><td className="p-2 font-semibold">HMRC</td><td className="p-2">VAT, CT600, RTI, CIS</td><td className="p-2">OAuth 2.0</td><td className="p-2">7 functions</td></tr>
                    <tr className="border-b"><td className="p-2 font-semibold">Companies House</td><td className="p-2">Company sync, filings</td><td className="p-2">API Key</td><td className="p-2">2 functions</td></tr>
                    <tr className="border-b"><td className="p-2 font-semibold">Gmail</td><td className="p-2">Email sync & send</td><td className="p-2">OAuth 2.0</td><td className="p-2">5 functions</td></tr>
                    <tr className="border-b"><td className="p-2 font-semibold">Outlook</td><td className="p-2">Email sync & send</td><td className="p-2">OAuth 2.0</td><td className="p-2">5 functions</td></tr>
                    <tr className="border-b"><td className="p-2 font-semibold">TrueLayer</td><td className="p-2">Open Banking</td><td className="p-2">OAuth 2.0</td><td className="p-2">3 functions</td></tr>
                    <tr className="border-b"><td className="p-2 font-semibold">Stripe</td><td className="p-2">Payments & billing</td><td className="p-2">API Key</td><td className="p-2">5 functions</td></tr>
                  </tbody>
                </TableWrapper>
              </CardContent>
            </Card>
          </Section>

          {/* Section 6: Workflows */}
          <Section 
            sectionNumber={6}
            title="Workflows & State Machines" 
            icon={<GitBranch className="h-5 w-5" />}
          >
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Job Lifecycle</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="font-mono text-sm bg-muted p-4 rounded">
                    not_started → in_progress → awaiting_info → review → complete<br/>
                    (blocked can occur at any stage)
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Filing Lifecycle</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="font-mono text-sm bg-muted p-4 rounded">
                    not_started → draft → in_progress → awaiting_approval → ready_to_file → submitted → filed<br/>
                    (rejected/failed are terminal states)
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Invoice Lifecycle</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="font-mono text-sm bg-muted p-4 rounded">
                    DRAFT → ISSUED → SENT → AWAITING_PAYMENT → PART_PAID → PAID<br/>
                    (VOID from ISSUED/SENT)
                  </div>
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* Section 7: Permissions */}
          <Section 
            sectionNumber={7}
            title="Permissions & Access Control" 
            icon={<Shield className="h-5 w-5" />}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Role Hierarchy & Permissions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 font-mono text-sm">viewer &lt; staff &lt; manager &lt; admin &lt; owner</p>
                <TableWrapper>
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Permission</th>
                      <th className="text-center p-2">Owner</th>
                      <th className="text-center p-2">Admin</th>
                      <th className="text-center p-2">Manager</th>
                      <th className="text-center p-2">Staff</th>
                      <th className="text-center p-2">Viewer</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b"><td className="p-2">Manage practice settings</td><td className="text-center p-2">✓</td><td className="text-center p-2">✓</td><td className="text-center p-2">-</td><td className="text-center p-2">-</td><td className="text-center p-2">-</td></tr>
                    <tr className="border-b"><td className="p-2">Manage team</td><td className="text-center p-2">✓</td><td className="text-center p-2">✓</td><td className="text-center p-2">-</td><td className="text-center p-2">-</td><td className="text-center p-2">-</td></tr>
                    <tr className="border-b"><td className="p-2">Submit filings</td><td className="text-center p-2">✓</td><td className="text-center p-2">✓</td><td className="text-center p-2">✓</td><td className="text-center p-2">-</td><td className="text-center p-2">-</td></tr>
                    <tr className="border-b"><td className="p-2">Create jobs</td><td className="text-center p-2">✓</td><td className="text-center p-2">✓</td><td className="text-center p-2">✓</td><td className="text-center p-2">✓</td><td className="text-center p-2">-</td></tr>
                    <tr className="border-b"><td className="p-2">Issue invoices</td><td className="text-center p-2">✓</td><td className="text-center p-2">✓</td><td className="text-center p-2">✓</td><td className="text-center p-2">-</td><td className="text-center p-2">-</td></tr>
                    <tr className="border-b"><td className="p-2">Void paid invoices</td><td className="text-center p-2">✓</td><td className="text-center p-2">✓</td><td className="text-center p-2">-</td><td className="text-center p-2">-</td><td className="text-center p-2">-</td></tr>
                    <tr className="border-b"><td className="p-2">Lock periods</td><td className="text-center p-2">✓</td><td className="text-center p-2">✓</td><td className="text-center p-2">-</td><td className="text-center p-2">-</td><td className="text-center p-2">-</td></tr>
                  </tbody>
                </TableWrapper>
              </CardContent>
            </Card>
          </Section>

          {/* Section 8: Edge Functions */}
          <Section 
            sectionNumber={8}
            title="Edge Functions Inventory" 
            icon={<Zap className="h-5 w-5" />}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">38 Edge Functions</CardTitle>
              </CardHeader>
              <CardContent>
                <TableWrapper>
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Category</th>
                      <th className="text-left p-2">Functions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b"><td className="p-2 font-semibold">HMRC</td><td className="p-2 text-xs">hmrc-auth, hmrc-callback, hmrc-vat-submit, hmrc-vat-obligations, hmrc-ct-submit, hmrc-ct-poll, hmrc-ct-delete</td></tr>
                    <tr className="border-b"><td className="p-2 font-semibold">Companies House</td><td className="p-2 text-xs">companies-house-sync, ch-submit</td></tr>
                    <tr className="border-b"><td className="p-2 font-semibold">Gmail</td><td className="p-2 text-xs">gmail-auth, gmail-callback, gmail-exchange, gmail-sync, gmail-send</td></tr>
                    <tr className="border-b"><td className="p-2 font-semibold">Outlook</td><td className="p-2 text-xs">outlook-auth, outlook-callback, outlook-exchange, outlook-sync, outlook-send</td></tr>
                    <tr className="border-b"><td className="p-2 font-semibold">TrueLayer</td><td className="p-2 text-xs">truelayer-auth, truelayer-callback, truelayer-sync</td></tr>
                    <tr className="border-b"><td className="p-2 font-semibold">Stripe</td><td className="p-2 text-xs">stripe-checkout, stripe-webhook, stripe-connect-onboard, stripe-connect-charge, customer-portal, check-subscription</td></tr>
                    <tr className="border-b"><td className="p-2 font-semibold">Filing</td><td className="p-2 text-xs">rti-submit, cis-submit, generate-filing-pdf</td></tr>
                    <tr className="border-b"><td className="p-2 font-semibold">Background</td><td className="p-2 text-xs">process-automation-events, process-email-queue, sla-check, session-cleanup</td></tr>
                    <tr className="border-b"><td className="p-2 font-semibold">Other</td><td className="p-2 text-xs">send-engagement-letter, fx-rates</td></tr>
                  </tbody>
                </TableWrapper>
              </CardContent>
            </Card>
          </Section>

          {/* Section 9: Technical Architecture */}
          <Section 
            sectionNumber={9}
            title="Technical Architecture" 
            icon={<Code className="h-5 w-5" />}
          >
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Frontend Stack</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <Badge variant="outline">React 18</Badge>
                    <Badge variant="outline">TypeScript 5</Badge>
                    <Badge variant="outline">Vite 5</Badge>
                    <Badge variant="outline">Tailwind CSS 3</Badge>
                    <Badge variant="outline">shadcn/ui</Badge>
                    <Badge variant="outline">TanStack Query 5</Badge>
                    <Badge variant="outline">React Router 6</Badge>
                    <Badge variant="outline">React Hook Form 7</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Backend Stack</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <Badge variant="outline">Supabase</Badge>
                    <Badge variant="outline">PostgreSQL</Badge>
                    <Badge variant="outline">Deno Edge Functions</Badge>
                    <Badge variant="outline">Row-Level Security</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Component Organization</CardTitle>
                </CardHeader>
                <CardContent className="font-mono text-xs">
                  <pre className="bg-muted p-4 rounded overflow-x-auto">
{`src/
├── components/
│   ├── ui/              # 50+ shadcn components
│   ├── bookkeeping/     # 35 components
│   ├── jobs/            # 15 components
│   ├── cosec/           # 15 components
│   ├── payroll/         # 12 components
│   └── ...
├── lib/                 # 75+ service files
├── pages/               # 43 page components
└── hooks/               # Custom hooks`}
                  </pre>
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* Section 10: Known Gaps */}
          <Section 
            sectionNumber={10}
            title="Known Gaps & TODOs" 
            icon={<AlertTriangle className="h-5 w-5" />}
          >
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Partially Implemented</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>Self-Assessment Filing - UI exists, HMRC SA API pending</li>
                    <li>MTD for Income Tax - Not started</li>
                    <li>Client Portal App - Schema ready, separate app not built</li>
                    <li>Multi-currency Bookkeeping - FX columns exist, full support incomplete</li>
                    <li>Document Signing - Basic signature, no DocuSign integration</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sandbox-Only Integrations</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>Companies House Filing - Sandbox only</li>
                    <li>HMRC CT600 - Sandbox testing mode</li>
                    <li>TrueLayer - Sandbox bank connections</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Technical Debt</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc pl-6 space-y-1 text-sm">
                    <li>Client type mismatch (ltd vs limited_company)</li>
                    <li>Some RLS policies need tightening</li>
                    <li>Large page components need splitting</li>
                    <li>Test coverage gaps</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </Section>

          <Separator className="my-8" />

          {/* Footer */}
          <div className="text-center text-sm text-muted-foreground pb-8">
            <p>AccountancyOS Master System Specification v1.0</p>
            <p>Generated February 2026</p>
          </div>
        </div>
      </div>
    </>
  );
}
