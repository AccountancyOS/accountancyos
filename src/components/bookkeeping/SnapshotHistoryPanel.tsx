import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Clock, FileCheck, FileX, ChevronRight, Database, Upload, FileSpreadsheet, ArrowRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { CreateWorkpaperFromSnapshotDialog } from "./CreateWorkpaperFromSnapshotDialog";

interface SnapshotHistoryPanelProps {
  entity: BookkeepingEntity;
  onSelectSnapshot?: (snapshot: any) => void;
}

const sourceLabels: Record<string, string> = {
  native: "AccountancyOS",
  xero: "Xero",
  quickbooks: "QuickBooks",
  sage: "Sage",
  freeagent: "FreeAgent",
  manual_import: "CSV Import",
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  finalised: { label: "Finalised", variant: "default" },
  used_in_workpaper: { label: "In Workpaper", variant: "default" },
  superseded: { label: "Superseded", variant: "outline" },
};

export function SnapshotHistoryPanel({ entity, onSelectSnapshot }: SnapshotHistoryPanelProps) {
  const { organization } = useOrganization();
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);
  const [showWorkpaperDialog, setShowWorkpaperDialog] = useState(false);

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ["trial-balance-snapshots", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const query = supabase
        .from("trial_balance_snapshots")
        .select("*")
        .eq("organization_id", organization.id)
        .order("period_end", { ascending: false });

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const getSourceIcon = (sourceType: string) => {
    if (sourceType === "native") return <Database className="h-4 w-4" />;
    return <Upload className="h-4 w-4" />;
  };

  const handleCreateWorkpaper = (snapshot: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSnapshot(snapshot);
    setShowWorkpaperDialog(true);
  };

  return (
    <>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            <Clock className="h-4 w-4 mr-2" />
            Snapshot History
            {snapshots && snapshots.length > 0 && (
              <Badge variant="secondary" className="ml-2">{snapshots.length}</Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Trial Balance Snapshots</SheetTitle>
            <SheetDescription>
              Historical snapshots for {entity.name}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-150px)] mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : !snapshots || snapshots.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileX className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No snapshots yet</p>
                <p className="text-sm">Create a snapshot from the Trial Balance tab</p>
              </div>
            ) : (
              <div className="space-y-3">
                {snapshots.map((snapshot) => {
                  const balances = (snapshot.balances as any[]) || [];
                  const totalDebit = balances.reduce((sum, b) => sum + (b.debit || 0), 0);
                  const totalCredit = balances.reduce((sum, b) => sum + (b.credit || 0), 0);
                  const status = statusConfig[snapshot.status] || statusConfig.draft;
                  const canCreateWorkpaper = snapshot.status !== "used_in_workpaper";

                  return (
                    <div
                      key={snapshot.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div 
                          className="space-y-1 flex-1 cursor-pointer"
                          onClick={() => onSelectSnapshot?.(snapshot)}
                        >
                          <div className="flex items-center gap-2">
                            {getSourceIcon(snapshot.source_type)}
                            <span className="font-medium">
                              {format(new Date(snapshot.period_start), "d MMM yyyy")} –{" "}
                              {format(new Date(snapshot.period_end), "d MMM yyyy")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{sourceLabels[snapshot.source_type] || snapshot.source_type}</span>
                            <span>•</span>
                            <span>{balances.length} accounts</span>
                          </div>
                        </div>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-muted rounded px-2 py-1">
                          <span className="text-muted-foreground">Debits: </span>
                          <span className="font-mono">{formatCurrency(totalDebit)}</span>
                        </div>
                        <div className="bg-muted rounded px-2 py-1">
                          <span className="text-muted-foreground">Credits: </span>
                          <span className="font-mono">{formatCurrency(totalCredit)}</span>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Created {format(new Date(snapshot.created_at), "d MMM yyyy 'at' HH:mm")}
                        </span>
                        
                        {canCreateWorkpaper && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={(e) => handleCreateWorkpaper(snapshot, e)}
                          >
                            <FileSpreadsheet className="h-4 w-4 mr-1" />
                            Create Workpaper
                          </Button>
                        )}
                      </div>

                      {snapshot.notes && (
                        <p className="mt-2 text-sm text-muted-foreground italic">
                          {snapshot.notes}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {selectedSnapshot && (
        <CreateWorkpaperFromSnapshotDialog
          open={showWorkpaperDialog}
          onOpenChange={setShowWorkpaperDialog}
          snapshot={selectedSnapshot}
          entityName={entity.name}
          entityType={entity.type}
        />
      )}
    </>
  );
}
