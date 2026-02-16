import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  CheckCircle, 
  AlertTriangle, 
  FileText, 
  Plus,
  ArrowRight,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { CHDiscrepancy } from "@/lib/ch-sync-service";
import { createResolutionFiling, ResolutionFilingType } from "@/lib/cosec-filing-service";
import { formatStatus } from "@/lib/format-utils";

interface CS01ResolutionPanelProps {
  companyId: string;
  organizationId: string;
  discrepancies: CHDiscrepancy[];
  onResolutionsComplete: (complete: boolean) => void;
}

interface ResolutionItem {
  discrepancy: CHDiscrepancy;
  resolved: boolean;
  resolutionMethod: "file_form" | "add_internal" | "ignore" | null;
  filingId?: string;
}

export function CS01ResolutionPanel({
  companyId,
  organizationId,
  discrepancies,
  onResolutionsComplete,
}: CS01ResolutionPanelProps) {
  const queryClient = useQueryClient();
  const [resolutions, setResolutions] = useState<ResolutionItem[]>([]);
  const [createFilingDialog, setCreateFilingDialog] = useState<{
    open: boolean;
    discrepancy?: CHDiscrepancy;
    filingType?: ResolutionFilingType;
  }>({ open: false });

  // Initialize resolutions from discrepancies
  useEffect(() => {
    setResolutions(
      discrepancies.map(d => ({
        discrepancy: d,
        resolved: false,
        resolutionMethod: null,
      }))
    );
  }, [discrepancies]);

  // Check if all resolved
  useEffect(() => {
    const allResolved = resolutions.length === 0 || resolutions.every(r => r.resolved);
    onResolutionsComplete(allResolved);
  }, [resolutions, onResolutionsComplete]);

  // Fetch pending resolution filings
  const { data: pendingFilings } = useQuery({
    queryKey: ["resolution-filings", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("filings")
        .select("*")
        .eq("company_id", companyId)
        .in("filing_type", ["AP01", "TM01", "TM02", "PSC01", "PSC04", "PSC07", "SH01"])
        .neq("status", "filed");
      
      if (error) throw error;
      return data || [];
    },
  });

  // Create resolution filing mutation
  const createFilingMutation = useMutation({
    mutationFn: async ({ filingType, discIdx }: { filingType: ResolutionFilingType; discIdx: number }) => {
      const disc = discrepancies[discIdx];
      return createResolutionFiling({
        companyId,
        organizationId,
        filingType,
        relatedData: disc.chData || disc.internalData,
        discrepancyMessage: disc.message,
      });
    },
    onSuccess: (result, { discIdx }) => {
      if (result.success) {
        toast.success(`${result.filingType} filing created`);
        setResolutions(prev => 
          prev.map((r, i) => 
            i === discIdx 
              ? { ...r, resolved: true, resolutionMethod: "file_form", filingId: result.filingId }
              : r
          )
        );
        queryClient.invalidateQueries({ queryKey: ["resolution-filings", companyId] });
        setCreateFilingDialog({ open: false });
      } else {
        toast.error("Failed to create filing", { description: result.error });
      }
    },
  });

  const getFilingTypeForDiscrepancy = (type: string): ResolutionFilingType | null => {
    switch (type) {
      case "officer_missing_ch": return "AP01";
      case "officer_missing_internal": return "TM01";
      case "psc_missing_ch": return "PSC01";
      case "psc_missing_internal": return "PSC07";
      case "psc_control_mismatch": return "PSC04";
      default: return null;
    }
  };

  const handleResolve = (idx: number, method: "file_form" | "add_internal" | "ignore") => {
    if (method === "file_form") {
      const filingType = getFilingTypeForDiscrepancy(discrepancies[idx].type);
      if (filingType) {
        setCreateFilingDialog({
          open: true,
          discrepancy: discrepancies[idx],
          filingType,
        });
      }
    } else {
      setResolutions(prev =>
        prev.map((r, i) =>
          i === idx ? { ...r, resolved: true, resolutionMethod: method } : r
        )
      );
    }
  };

  const handleUnresolve = (idx: number) => {
    setResolutions(prev =>
      prev.map((r, i) =>
        i === idx ? { ...r, resolved: false, resolutionMethod: null } : r
      )
    );
  };

  const resolvedCount = resolutions.filter(r => r.resolved).length;
  const totalCount = resolutions.length;

  if (totalCount === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
          <h3 className="font-semibold text-lg">No Resolutions Required</h3>
          <p className="text-muted-foreground mt-2">
            Your internal registers match Companies House. Ready to file CS01.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Resolution Progress</h3>
              <p className="text-sm text-muted-foreground">
                {resolvedCount} of {totalCount} discrepancies resolved
              </p>
            </div>
            <Badge variant={resolvedCount === totalCount ? "default" : "secondary"}>
              {Math.round((resolvedCount / totalCount) * 100)}% Complete
            </Badge>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(resolvedCount / totalCount) * 100}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Pending Filings */}
      {pendingFilings && pendingFilings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pending Resolution Filings</CardTitle>
            <CardDescription>
              These filings must be completed before filing CS01
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingFilings.map((filing: any) => (
                <div 
                  key={filing.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{filing.filing_type}</p>
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(filing.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">{formatStatus(filing.status)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resolution Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discrepancies to Resolve</CardTitle>
          <CardDescription>
            Select a resolution method for each discrepancy
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {resolutions.map((item, idx) => (
              <div 
                key={idx}
                className={`p-4 rounded-lg border ${
                  item.resolved 
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
                    : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                }`}
              >
                <div className="flex items-start gap-4">
                  <Checkbox 
                    checked={item.resolved}
                    onCheckedChange={(checked) => {
                      if (!checked) handleUnresolve(idx);
                    }}
                  />
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{item.discrepancy.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Type: {formatDiscrepancyType(item.discrepancy.type)}
                        </p>
                      </div>
                      {item.resolved ? (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Resolved
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500 text-amber-700">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                    </div>

                    {!item.resolved && (
                      <div className="flex items-center gap-2 mt-4">
                        <Button
                          size="sm"
                          onClick={() => handleResolve(idx, "file_form")}
                          disabled={!getFilingTypeForDiscrepancy(item.discrepancy.type)}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          Create {getFilingTypeForDiscrepancy(item.discrepancy.type) || "Filing"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolve(idx, "add_internal")}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add to Internal
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleResolve(idx, "ignore")}
                        >
                          Ignore
                        </Button>
                      </div>
                    )}

                    {item.resolved && item.resolutionMethod && (
                      <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                        Resolution: {formatResolutionMethod(item.resolutionMethod)}
                        {item.filingId && " - Filing created"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Create Filing Dialog */}
      <Dialog 
        open={createFilingDialog.open} 
        onOpenChange={(open) => setCreateFilingDialog({ open })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create {createFilingDialog.filingType} Filing</DialogTitle>
            <DialogDescription>
              This will create a {createFilingDialog.filingType} filing to resolve the discrepancy.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm font-medium">Discrepancy:</p>
              <p className="text-sm text-muted-foreground mt-1">
                {createFilingDialog.discrepancy?.message}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setCreateFilingDialog({ open: false })}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const idx = discrepancies.findIndex(d => d === createFilingDialog.discrepancy);
                if (idx >= 0 && createFilingDialog.filingType) {
                  createFilingMutation.mutate({ 
                    filingType: createFilingDialog.filingType, 
                    discIdx: idx 
                  });
                }
              }}
              disabled={createFilingMutation.isPending}
            >
              {createFilingMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Create Filing
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatDiscrepancyType(type: string): string {
  switch (type) {
    case "officer_missing_internal": return "Officer in CH but not internal";
    case "officer_missing_ch": return "Officer internal but not in CH";
    case "psc_missing_internal": return "PSC in CH but not internal";
    case "psc_missing_ch": return "PSC internal but not in CH";
    case "psc_control_mismatch": return "PSC control differs";
    default: return type;
  }
}

function formatResolutionMethod(method: string): string {
  switch (method) {
    case "file_form": return "Filing created";
    case "add_internal": return "Added to internal register";
    case "ignore": return "Marked as ignored";
    default: return method;
  }
}
