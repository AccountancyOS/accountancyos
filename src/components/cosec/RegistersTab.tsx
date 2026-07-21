import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, AlertTriangle, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { syncCompanyWithCH, getLastCHSyncData, CHDiscrepancy } from "@/lib/ch-sync-service";
import { OfficersSection } from "./OfficersSection";
import { PSCsSection } from "./PSCsSection";
import { ShareClassesSection } from "./ShareClassesSection";
import { ShareholdersSection } from "./ShareholdersSection";
import { RegisterEventsTimeline } from "./RegisterEventsTimeline";
import { RegistersTabSkeleton } from "./RegistersTabSkeleton";
import { LinkCompaniesHouseDialog } from "@/components/company/LinkCompaniesHouseDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDistanceToNow } from "date-fns";

interface RegistersTabProps {
  companyId: string;
  organizationId: string;
}

export function RegistersTab({ companyId, organizationId }: RegistersTabProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("officers");
  const [syncProgress, setSyncProgress] = useState(0);

  // Fetch company CH sync data
  const { data: syncData, isLoading: syncLoading, error: syncError } = useQuery({
    queryKey: ["ch-sync-data", companyId],
    queryFn: () => getLastCHSyncData(companyId),
    retry: 2,
  });

  // Fetch company details for discrepancies
  const { data: company, isLoading: companyLoading, error: companyError } = useQuery({
    queryKey: ["company-registers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(`
          id,
          company_number,
          company_name,
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
    retry: 2,
  });

  // CH Sync mutation with progress
  const syncMutation = useMutation({
    mutationFn: async () => {
      setSyncProgress(10);
      const result = await syncCompanyWithCH(companyId, organizationId);
      setSyncProgress(100);
      return result;
    },
    onMutate: () => {
      setSyncProgress(0);
      toast.loading("Syncing with Companies House...", { id: "ch-sync" });
    },
    onSuccess: (result) => {
      toast.dismiss("ch-sync");
      if (result.success) {
        toast.success("Synced with Companies House", {
          description: result.data?.discrepancies?.length 
            ? `Found ${result.data.discrepancies.length} discrepancies` 
            : "All registers match Companies House records",
          icon: result.data?.discrepancies?.length ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <CheckCircle className="h-4 w-4 text-green-500" />,
        });
        queryClient.invalidateQueries({ queryKey: ["ch-sync-data", companyId] });
        queryClient.invalidateQueries({ queryKey: ["company-registers", companyId] });
        queryClient.invalidateQueries({ queryKey: ["company-detail", companyId] });
        queryClient.invalidateQueries({ queryKey: ["company-officers", companyId] });
        queryClient.invalidateQueries({ queryKey: ["company-pscs", companyId] });
        queryClient.invalidateQueries({ queryKey: ["register-events", companyId] });
      } else {
        toast.error("Sync failed", { description: result.error });
      }
      setTimeout(() => setSyncProgress(0), 500);
    },
    onError: (error: any) => {
      toast.dismiss("ch-sync");
      toast.error("Sync failed", { description: error.message });
      setSyncProgress(0);
    },
  });

  // Simulate progress during sync
  useEffect(() => {
    if (syncMutation.isPending && syncProgress < 90) {
      const timer = setTimeout(() => {
        setSyncProgress((prev) => Math.min(prev + 15, 90));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [syncMutation.isPending, syncProgress]);

  const discrepancies: CHDiscrepancy[] = (company?.ch_company_profile as any)?.discrepancies || [];
  const lastSyncedAt = company?.ch_last_synced_at;

  // Loading state
  if (companyLoading || syncLoading) {
    return <RegistersTabSkeleton />;
  }

  // Error state
  if (companyError || syncError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load registers data. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sync Status Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Companies House Registers</CardTitle>
              <CardDescription>
                {company?.company_number ? `Company No: ${company.company_number}` : "No company number"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {lastSyncedAt && (
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Last synced {formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}
                </div>
              )}
              {company?.company_number ? (
                <Button
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                  variant="outline"
                  size="sm"
                  className="min-w-[120px]"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                  {syncMutation.isPending ? "Syncing..." : "Sync with CH"}
                </Button>
              ) : (
                <LinkCompaniesHouseDialog
                  companyId={companyId}
                  defaultQuery={company?.company_name ?? undefined}
                  onLinked={() => syncMutation.mutate()}
                />
              )}
            </div>
          </div>
        </CardHeader>

        {/* Sync Progress Bar */}
        {syncMutation.isPending && (
          <CardContent className="pt-0 pb-3">
            <div className="space-y-2">
              <Progress value={syncProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {syncProgress < 30 && "Connecting to Companies House..."}
                {syncProgress >= 30 && syncProgress < 60 && "Fetching company data..."}
                {syncProgress >= 60 && syncProgress < 90 && "Comparing registers..."}
                {syncProgress >= 90 && "Finalizing sync..."}
              </p>
            </div>
          </CardContent>
        )}

        {/* Discrepancies Alert */}
        {discrepancies.length > 0 && !syncMutation.isPending && (
          <CardContent className="pt-0">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-800 dark:text-amber-200">
                    {discrepancies.length} Discrepancies Found
                  </h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    The internal registers differ from Companies House records. Review and resolve before filing CS01.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {discrepancies.slice(0, 3).map((d, i) => (
                      <li key={i} className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        {d.message}
                      </li>
                    ))}
                    {discrepancies.length > 3 && (
                      <li className="text-sm text-amber-600 dark:text-amber-400">
                        +{discrepancies.length - 3} more discrepancies
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        )}

        {/* Confirmation Statement Status */}
        {company?.confirmation_statement_next_due && (
          <CardContent className="pt-0">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">CS01 Made Up To:</span>
                <Badge variant="outline">
                  {company.confirmation_statement_made_up_to || "Not filed"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Next Due:</span>
                <Badge 
                  variant={new Date(company.confirmation_statement_next_due) < new Date() ? "destructive" : "secondary"}
                >
                  {company.confirmation_statement_next_due}
                </Badge>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Register Tabs - mobile responsive */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto flex-wrap sm:flex-nowrap w-full gap-1">
          <TabsTrigger value="officers" className="flex-1 sm:flex-initial text-xs sm:text-sm">
            Officers
          </TabsTrigger>
          <TabsTrigger value="pscs" className="flex-1 sm:flex-initial text-xs sm:text-sm">
            PSCs
          </TabsTrigger>
          <TabsTrigger value="share-classes" className="flex-1 sm:flex-initial text-xs sm:text-sm">
            <span className="hidden sm:inline">Share Classes</span>
            <span className="sm:hidden">Shares</span>
          </TabsTrigger>
          <TabsTrigger value="shareholders" className="flex-1 sm:flex-initial text-xs sm:text-sm">
            <span className="hidden sm:inline">Shareholders</span>
            <span className="sm:hidden">Holders</span>
          </TabsTrigger>
          <TabsTrigger value="events" className="flex-1 sm:flex-initial text-xs sm:text-sm">
            Events
          </TabsTrigger>
        </TabsList>

        <TabsContent value="officers" className="mt-4">
          <OfficersSection 
            companyId={companyId} 
            organizationId={organizationId}
            chOfficers={syncData?.officers}
          />
        </TabsContent>

        <TabsContent value="pscs" className="mt-4">
          <PSCsSection 
            companyId={companyId} 
            organizationId={organizationId}
            chPSCs={syncData?.pscs}
          />
        </TabsContent>

        <TabsContent value="share-classes" className="mt-4">
          <ShareClassesSection 
            companyId={companyId} 
            organizationId={organizationId}
          />
        </TabsContent>

        <TabsContent value="shareholders" className="mt-4">
          <ShareholdersSection 
            companyId={companyId} 
            organizationId={organizationId}
          />
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <RegisterEventsTimeline companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
