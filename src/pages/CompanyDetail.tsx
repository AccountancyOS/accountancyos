import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { 
  Building2, 
  ClipboardList, 
  FileText, 
  Settings, 
  FolderOpen,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Hash,
  AlertCircle,
  Wallet,
  Lock,
  Send
} from "lucide-react";
import { format } from "date-fns";
import { RegistersTab } from "@/components/cosec/RegistersTab";
import { CS01WorkpaperTab } from "@/components/cosec/CS01WorkpaperTab";
import { CompanyCoSecJobsTab } from "@/components/cosec/CompanyCoSecJobsTab";
import { CompanyDetailSkeleton } from "@/components/cosec/CompanyDetailSkeleton";
import { CompanyPayrollTab } from "@/components/cosec/CompanyPayrollTab";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useEntityServices } from "@/hooks/useEntityServices";
import { ComposeEmailDialog } from "@/components/email/ComposeEmailDialog";

const CompanyDetail = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const [activeTab, setActiveTab] = useState("overview");
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  // Service gating for Payroll tab
  const { hasPayroll, isLoading: servicesLoading } = useEntityServices(
    'company',
    companyId ?? null
  );

  const { data: company, isLoading, error, refetch } = useQuery({
    queryKey: ["company-detail", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("companies")
        .select("*, ch_company_profile")
        .eq("id", companyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    retry: 2,
  });

  // Count discrepancies from CH profile
  const discrepancyCount = (company?.ch_company_profile as any)?.discrepancies?.length || 0;

  if (isLoading) {
    return (
      <DashboardLayout>
        <CompanyDetailSkeleton />
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/clients">Clients</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Error</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load company</AlertTitle>
            <AlertDescription className="mt-2">
              {(error as Error).message || "An unexpected error occurred"}
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Try Again
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/clients")}>
                  Return to Clients
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  if (!company) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Company not found</h2>
          <Button variant="link" onClick={() => navigate("/clients")}>
            Return to Clients
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const getTabLabel = (tab: string) => {
    const labels: Record<string, string> = {
      overview: "Overview",
      registers: "Registers",
      "cosec-jobs": "CoSec Jobs",
      documents: "Documents",
      settings: "Settings",
    };
    return labels[tab] || tab;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Breadcrumb Navigation with active tab */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/clients">Clients</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {activeTab === "overview" ? (
                <BreadcrumbPage>{company.company_name}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink 
                  className="cursor-pointer"
                  onClick={() => setActiveTab("overview")}
                >
                  {company.company_name}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {activeTab !== "overview" && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{getTabLabel(activeTab)}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/clients")}
              className="mt-1"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-foreground">
                  {company.company_name}
                </h1>
                <Badge variant={company.status === "active" ? "default" : "secondary"}>
                  {company.status}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                {company.company_number && (
                  <span className="flex items-center gap-1">
                    <Hash className="h-3.5 w-3.5" />
                    {company.company_number}
                  </span>
                )}
                {company.incorporation_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Inc. {format(new Date(company.incorporation_date), "d MMM yyyy")}
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button onClick={() => setIsComposeOpen(true)}>
            <Send className="h-4 w-4 mr-2" />
            Email
          </Button>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto flex-wrap sm:flex-nowrap w-full sm:w-auto sm:inline-flex gap-1">
            <TabsTrigger value="overview" className="flex items-center gap-2 flex-1 sm:flex-initial">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="registers" className="flex items-center gap-2 flex-1 sm:flex-initial relative">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Registers</span>
              {discrepancyCount > 0 && (
                <span className="absolute -top-1 -right-1 sm:static sm:ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-medium text-white">
                  {discrepancyCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="cosec-jobs" className="flex items-center gap-2 flex-1 sm:flex-initial">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">CoSec Jobs</span>
            </TabsTrigger>
            {(hasPayroll || servicesLoading) && (
              <TabsTrigger value="payroll" className="flex items-center gap-2 flex-1 sm:flex-initial">
                <Wallet className="h-4 w-4" />
                <span className="hidden sm:inline">Payroll</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="documents" className="flex items-center gap-2 flex-1 sm:flex-initial">
              <FolderOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Documents</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2 flex-1 sm:flex-initial">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            {/* Company Details Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Company Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Company Type</p>
                      <p className="font-medium">{company.company_type || "Private Limited"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Year End</p>
                      <p className="font-medium">
                        {company.year_end_day && company.year_end_month
                          ? `${company.year_end_day}/${company.year_end_month}`
                          : "Not set"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">VAT Registered</p>
                      <p className="font-medium">{company.vat_number || "No"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">VAT Scheme</p>
                      <p className="font-medium">{company.vat_scheme || "-"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Contact Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Contact Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {company.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a href={`mailto:${company.email}`} className="hover:underline">
                        {company.email}
                      </a>
                    </div>
                  )}
                  {company.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a href={`tel:${company.phone}`} className="hover:underline">
                        {company.phone}
                      </a>
                    </div>
                  )}
                  {(company.address_line_1 || company.city) && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        {company.address_line_1 && <p>{company.address_line_1}</p>}
                        {company.address_line_2 && <p>{company.address_line_2}</p>}
                        {(company.city || company.postcode) && (
                          <p>{[company.city, company.postcode].filter(Boolean).join(", ")}</p>
                        )}
                        {company.country && <p>{company.country}</p>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Companies House Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Companies House Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Last CH Sync</p>
                      <p className="font-medium">
                        {company.ch_last_synced_at
                          ? format(new Date(company.ch_last_synced_at), "d MMM yyyy HH:mm")
                          : "Never"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">CS01 Next Due</p>
                      <p className="font-medium">
                        {company.confirmation_statement_next_due
                          ? format(new Date(company.confirmation_statement_next_due), "d MMM yyyy")
                          : "Unknown"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* AML Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">AML Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Verified At</p>
                      <p className="font-medium">
                        {company.aml_verified_at
                          ? format(new Date(company.aml_verified_at), "d MMM yyyy")
                          : "Not verified"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Expiry Date</p>
                      <p className="font-medium">
                        {company.aml_expiry_date
                          ? format(new Date(company.aml_expiry_date), "d MMM yyyy")
                          : "-"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="registers" className="mt-6">
            {organization?.id && (
              <RegistersTab 
                companyId={companyId!} 
                organizationId={organization.id} 
              />
            )}
          </TabsContent>

          <TabsContent value="cosec-jobs" className="mt-6">
            {organization?.id && (
              <CompanyCoSecJobsTab 
                companyId={companyId!} 
                organizationId={organization.id} 
              />
            )}
          </TabsContent>

          <TabsContent value="payroll" className="mt-6">
            {organization?.id && hasPayroll ? (
              <CompanyPayrollTab 
                companyId={companyId!} 
                organizationId={organization.id} 
              />
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Lock className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    Payroll Not Enabled
                  </h3>
                  <p className="text-muted-foreground mb-6 max-w-md">
                    Payroll is not configured for this company. 
                    Add it to their engagement to start using payroll features.
                  </p>
                  <Button onClick={() => setActiveTab("settings")}>
                    Configure Service
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="documents" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Company Documents</CardTitle>
                <CardDescription>
                  View and manage documents for this company
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Document management coming soon...
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Company Settings</CardTitle>
                <CardDescription>
                  Configure company-specific settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Settings configuration coming soon...
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Compose Email Dialog */}
        <ComposeEmailDialog
          open={isComposeOpen}
          onOpenChange={setIsComposeOpen}
          companyId={companyId}
          defaultTo={company.email}
          defaultToName={company.company_name}
        />
      </div>
    </DashboardLayout>
  );
};

export default CompanyDetail;
