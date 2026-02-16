import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileCheck, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Send, 
  FileText,
  ArrowRight,
  Clock,
  Users,
  Building2,
  Coins,
  Scale,
  Download,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { formatStatus } from "@/lib/format-utils";
import { format, formatDistanceToNow } from "date-fns";
import { syncCompanyWithCH, getLastCHSyncData, CHDiscrepancy, CHOfficer, CHPSC } from "@/lib/ch-sync-service";
import { CS01DiffView } from "./CS01DiffView";
import { CS01ResolutionPanel } from "./CS01ResolutionPanel";
import { createCS01Filing, CS01FilingData } from "@/lib/cosec-filing-service";
import { logAudit } from "@/lib/audit-service";

interface CS01WorkpaperTabProps {
  companyId: string;
  jobId?: string;
  workpaperId?: string;
}

export function CS01WorkpaperTab({ companyId, jobId, workpaperId }: CS01WorkpaperTabProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState("overview");
  const [resolutionsComplete, setResolutionsComplete] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Fetch company data
  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ["company-cs01", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(`
          *,
          ch_company_profile,
          ch_last_synced_at,
          confirmation_statement_made_up_to,
          confirmation_statement_next_due
        `)
        .eq("id", companyId)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch internal officers
  const { data: officers } = useQuery({
    queryKey: ["company-officers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_officers")
        .select(`
          *,
          person:company_persons(*)
        `)
        .eq("company_id", companyId)
        .is("resigned_at", null);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch internal PSCs
  const { data: pscs } = useQuery({
    queryKey: ["company-pscs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_pscs")
        .select(`
          *,
          person:company_persons(*)
        `)
        .eq("company_id", companyId)
        .is("ceased_at", null);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch share classes and shareholders
  const { data: shareClasses } = useQuery({
    queryKey: ["company-share-classes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_share_classes")
        .select("*")
        .eq("company_id", companyId);
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: shareholders } = useQuery({
    queryKey: ["company-shareholders", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_shareholders")
        .select(`
          *,
          person:company_persons(*),
          share_class:company_share_classes(*)
        `)
        .eq("company_id", companyId)
        .gt("shares_held", 0);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch CH sync data
  const { data: syncData } = useQuery({
    queryKey: ["ch-sync-data", companyId],
    queryFn: () => getLastCHSyncData(companyId),
  });

  // Fetch existing CS01 filing for this job
  const { data: existingFiling } = useQuery({
    queryKey: ["cs01-filing", jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const { data, error } = await supabase
        .from("filings")
        .select("*")
        .eq("job_id", jobId)
        .eq("filing_type", "CS01")
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });

  // CH Sync mutation
  const syncMutation = useMutation({
    mutationFn: () => syncCompanyWithCH(companyId, organization?.id || ""),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Synced with Companies House");
        queryClient.invalidateQueries({ queryKey: ["company-cs01", companyId] });
        queryClient.invalidateQueries({ queryKey: ["ch-sync-data", companyId] });
      } else {
        toast.error("Sync failed", { description: result.error });
      }
    },
  });

  // Create filing mutation
  const createFilingMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !company) throw new Error("Missing data");
      
      const filingData: CS01FilingData = {
        companyId,
        organizationId: organization.id,
        jobId,
        madeUpToDate: calculateMadeUpToDate(company.confirmation_statement_made_up_to),
        officers: officers?.map(o => ({
          personId: o.person_id,
          name: `${o.person?.first_name} ${o.person?.last_name}`,
          role: o.role,
          appointedOn: o.appointed_at,
        })) || [],
        pscs: pscs?.map(p => ({
          personId: p.person_id,
          name: `${p.person?.first_name} ${p.person?.last_name}`,
          natureOfControl: p.nature_of_control,
          notifiedOn: p.notified_at,
        })) || [],
        shareCapital: {
          classes: shareClasses?.map(sc => ({
            className: sc.class_name,
            nominalValue: sc.nominal_value,
            currency: sc.currency,
            totalIssued: sc.total_shares_issued,
          })) || [],
          totalShares: shareClasses?.reduce((sum, sc) => sum + sc.total_shares_issued, 0) || 0,
        },
        sicCodes: (company.sic_codes as string[]) || [],
        registeredOffice: company.registered_office_address as any,
        tradingStatusUnchanged: true,
        statementOfCapitalCorrect: true,
      };
      
      return createCS01Filing(filingData);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("CS01 filing created");
        queryClient.invalidateQueries({ queryKey: ["cs01-filing", jobId] });
      } else {
        toast.error("Failed to create filing", { description: result.error });
      }
    },
  });

  // Extract discrepancies from CH profile
  const discrepancies: CHDiscrepancy[] = (company?.ch_company_profile as any)?.discrepancies || [];
  const chOfficers: CHOfficer[] = syncData?.officers || [];
  const chPSCs: CHPSC[] = syncData?.pscs || [];

  // Calculate workpaper status
  const hasDiscrepancies = discrepancies.length > 0;
  const canCreateFiling = !hasDiscrepancies || resolutionsComplete;
  const lastSyncedAt = company?.ch_last_synced_at;

  // Calculate totals
  const totalShares = shareClasses?.reduce((sum, sc) => sum + sc.total_shares_issued, 0) || 0;
  const totalCapital = shareClasses?.reduce((sum, sc) => sum + (sc.total_shares_issued * sc.nominal_value), 0) || 0;

  if (companyLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                CS01 Confirmation Statement
              </CardTitle>
              <CardDescription>
                {company?.company_name} • {company?.company_number}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {existingFiling ? (
                <Badge 
                  className={
                    existingFiling.status === "filed" ? "bg-green-600" :
                    existingFiling.status === "ready_to_file" ? "bg-emerald-500" :
                    existingFiling.status === "awaiting_approval" ? "bg-yellow-500" :
                    "bg-blue-500"
                  }
                >
                   {formatStatus(existingFiling.status)}
                </Badge>
              ) : (
                <Badge variant="outline">Not Started</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Last CS01 Made Up To</p>
              <p className="font-medium">
                {company?.confirmation_statement_made_up_to 
                  ? format(new Date(company.confirmation_statement_made_up_to), "d MMM yyyy")
                  : "Not filed"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Next Due</p>
              <p className="font-medium">
                {company?.confirmation_statement_next_due 
                  ? format(new Date(company.confirmation_statement_next_due), "d MMM yyyy")
                  : "Unknown"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">New Made Up To Date</p>
              <p className="font-medium">
                {format(new Date(calculateMadeUpToDate(company?.confirmation_statement_made_up_to)), "d MMM yyyy")}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">CH Sync Status</p>
              <div className="flex items-center gap-2">
                {lastSyncedAt ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">{formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Never synced</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              Refresh from CH
            </Button>
            {!existingFiling && (
              <Button
                size="sm"
                onClick={() => createFilingMutation.mutate()}
                disabled={!canCreateFiling || createFilingMutation.isPending}
              >
                <FileText className="h-4 w-4 mr-2" />
                Create CS01 Filing
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Discrepancies Alert */}
      {hasDiscrepancies && !resolutionsComplete && (
        <Card className="border-amber-300 dark:border-amber-700">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                  {discrepancies.length} Discrepancies Require Resolution
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Before filing the CS01, you must resolve the differences between your internal registers 
                  and Companies House records. This may require filing additional forms (AP01, TM01, etc.).
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-3"
                  onClick={() => setActiveSection("diff")}
                >
                  View Discrepancies
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="diff" className="relative">
            Diff View
            {hasDiscrepancies && (
              <span className="ml-2 w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center">
                {discrepancies.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="resolutions">Resolutions</TabsTrigger>
          <TabsTrigger value="filing">Filing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{officers?.length || 0}</p>
                    <p className="text-sm text-muted-foreground">Officers</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <Scale className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{pscs?.length || 0}</p>
                    <p className="text-sm text-muted-foreground">PSCs</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <Coins className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalShares.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">Total Shares</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Building2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      £{totalCapital.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-sm text-muted-foreground">Share Capital</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Officers List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Officers</CardTitle>
            </CardHeader>
            <CardContent>
              {officers && officers.length > 0 ? (
                <div className="space-y-2">
                  {officers.map((officer: any) => (
                    <div key={officer.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="font-medium">
                          {officer.person?.first_name} {officer.person?.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground capitalize">{officer.role}</p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        Appointed: {format(new Date(officer.appointed_at), "d MMM yyyy")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No officers found</p>
              )}
            </CardContent>
          </Card>

          {/* PSCs List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Persons with Significant Control</CardTitle>
            </CardHeader>
            <CardContent>
              {pscs && pscs.length > 0 ? (
                <div className="space-y-2">
                  {pscs.map((psc: any) => (
                    <div key={psc.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="font-medium">
                          {psc.person?.first_name} {psc.person?.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {psc.nature_of_control?.slice(0, 2).join(", ")}
                        </p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        Notified: {format(new Date(psc.notified_at), "d MMM yyyy")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No PSCs found</p>
              )}
            </CardContent>
          </Card>

          {/* Share Capital */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Statement of Capital</CardTitle>
            </CardHeader>
            <CardContent>
              {shareClasses && shareClasses.length > 0 ? (
                <div className="space-y-2">
                  {shareClasses.map((sc: any) => (
                    <div key={sc.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="font-medium">{sc.class_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {sc.total_shares_issued.toLocaleString()} shares @ {sc.currency} {sc.nominal_value.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          {sc.currency} {(sc.total_shares_issued * sc.nominal_value).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No share classes found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diff" className="mt-4">
          <CS01DiffView
            companyId={companyId}
            internalOfficers={officers || []}
            internalPSCs={pscs || []}
            chOfficers={chOfficers}
            chPSCs={chPSCs}
            discrepancies={discrepancies}
            onSync={() => syncMutation.mutate()}
            isSyncing={syncMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="resolutions" className="mt-4">
          <CS01ResolutionPanel
            companyId={companyId}
            organizationId={organization?.id || ""}
            discrepancies={discrepancies}
            onResolutionsComplete={(complete) => setResolutionsComplete(complete)}
          />
        </TabsContent>

        <TabsContent value="filing" className="mt-4">
          {existingFiling ? (
            <Card>
              <CardHeader>
                <CardTitle>CS01 Filing</CardTitle>
                <CardDescription>
                  Created {format(new Date(existingFiling.created_at), "d MMM yyyy HH:mm")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge className="mt-1">{existingFiling.status.replace(/_/g, " ")}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Made Up To Date</p>
                    <p className="font-medium">
                      {existingFiling.period_end 
                        ? format(new Date(existingFiling.period_end), "d MMM yyyy")
                        : "Not set"}
                    </p>
                  </div>
                </div>

                {existingFiling.status === "draft" && (
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      onClick={async () => {
                        setGeneratingPdf(true);
                        try {
                          const { data, error } = await supabase.functions.invoke("generate-filing-pdf", {
                            body: { filingId: existingFiling.id, documentType: "cs01_summary" },
                          });
                          if (error) throw error;
                          if (data.html) {
                            const htmlContent = atob(data.html);
                            const blob = new Blob([htmlContent], { type: "text/html" });
                            window.open(URL.createObjectURL(blob), "_blank");
                            toast.success("PDF generated");
                          }
                        } catch (err: any) {
                          toast.error("Failed to generate PDF", { description: err.message });
                        } finally {
                          setGeneratingPdf(false);
                        }
                      }}
                      disabled={generatingPdf}
                    >
                      {generatingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                      Generate PDF
                    </Button>
                    <Button className="flex-1">
                      <Send className="h-4 w-4 mr-2" />
                      Send for Client Approval
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {canCreateFiling 
                    ? "No filing created yet. Click 'Create CS01 Filing' to proceed."
                    : "Resolve all discrepancies before creating the filing."}
                </p>
                {canCreateFiling && (
                  <Button 
                    className="mt-4"
                    onClick={() => createFilingMutation.mutate()}
                    disabled={createFilingMutation.isPending}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Create CS01 Filing
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function calculateMadeUpToDate(lastMadeUpTo: string | null): string {
  if (!lastMadeUpTo) {
    // Default to today
    return new Date().toISOString().split("T")[0];
  }
  
  // New made up to date is 1 year after last
  const lastDate = new Date(lastMadeUpTo);
  lastDate.setFullYear(lastDate.getFullYear() + 1);
  return lastDate.toISOString().split("T")[0];
}
