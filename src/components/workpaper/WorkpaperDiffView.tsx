import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { 
  History, 
  ArrowRight, 
  User, 
  Calendar,
  FileEdit,
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";

interface WorkpaperDiffViewProps {
  isOpen: boolean;
  onClose: () => void;
  workpaperId: string;
  fieldOverrides?: Record<string, any>;
  fieldNotes?: Record<string, string>;
  fieldValues?: Record<string, any>;
  entityType?: "workpaper_instance" | "filing" | "trial_balance_snapshot";
}

interface AuditEntry {
  id: string;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  user_id: string | null;
  created_at: string;
  metadata: Record<string, any> | null;
}

export function WorkpaperDiffView({ 
  isOpen,
  onClose,
  workpaperId,
  fieldOverrides = {},
  fieldNotes = {},
  fieldValues = {},
  entityType = "workpaper_instance" 
}: WorkpaperDiffViewProps) {
  const { data: auditLog, isLoading } = useQuery({
    queryKey: ["workpaper-audit", workpaperId, entityType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", workpaperId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as AuditEntry[];
    },
    enabled: isOpen && !!workpaperId,
  });

  const { data: users } = useQuery({
    queryKey: ["audit-users", auditLog?.map(e => e.user_id).filter(Boolean)],
    queryFn: async () => {
      const userIds = auditLog?.map(e => e.user_id).filter(Boolean) as string[];
      if (!userIds.length) return {};
      
      const { data } = await supabase
        .from("organization_users")
        .select("user_id, role")
        .in("user_id", userIds);
      
      return (data || []).reduce((acc, u) => {
        acc[u.user_id] = u.role || "User";
        return acc;
      }, {} as Record<string, string>);
    },
    enabled: !!auditLog?.length,
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case "override":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-200">Override</Badge>;
      case "create":
        return <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-200">Created</Badge>;
      case "update":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-200">Updated</Badge>;
      case "finalise":
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-700 border-purple-200">Finalised</Badge>;
      case "approve":
        return <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-200">Approved</Badge>;
      case "reject":
        return <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-200">Rejected</Badge>;
      case "file":
        return <Badge variant="outline" className="bg-indigo-500/10 text-indigo-700 border-indigo-200">Filed</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  const formatFieldName = (fieldName: string | null): string => {
    if (!fieldName) return "N/A";
    return fieldName
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  const formatValue = (value: string | null): string => {
    if (value === null || value === undefined) return "—";
    
    const num = parseFloat(value);
    if (!isNaN(num) && value.match(/^-?\d+\.?\d*$/)) {
      return new Intl.NumberFormat("en-GB", {
        style: "decimal",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
    }
    
    if (value.length > 50) {
      return value.substring(0, 50) + "...";
    }
    
    return value;
  };

  const getSourceLevel = (metadata: Record<string, any> | null): string | null => {
    return metadata?.level || null;
  };

  // Build current overrides from props for display
  const currentOverrides = Object.entries(fieldOverrides).map(([fieldName, originalValue]) => ({
    fieldName,
    originalValue,
    currentValue: fieldValues[fieldName],
    note: fieldNotes[fieldName],
  }));

  const auditOverrides = auditLog?.filter(e => e.action === "override") || [];
  const otherChanges = auditLog?.filter(e => e.action !== "override") || [];

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[500px] sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Change History
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Current Overrides Section */}
          {currentOverrides.length > 0 && (
            <div>
              <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
                <FileEdit className="h-4 w-4 text-amber-600" />
                Current Overrides ({currentOverrides.length})
              </h4>
              <ScrollArea className="h-[200px]">
                <div className="space-y-3">
                  {currentOverrides.map((override) => (
                    <div 
                      key={override.fieldName} 
                      className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 border border-amber-100 dark:border-amber-900/30"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="font-medium text-sm">
                          {formatFieldName(override.fieldName)}
                        </span>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-200">
                          Overridden
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm mb-2">
                        <span className="text-muted-foreground line-through">
                          {formatValue(
                            typeof override.originalValue === 'object' 
                              ? override.originalValue?.amount?.toString() 
                              : override.originalValue?.toString()
                          )}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium text-amber-700 dark:text-amber-400">
                          {formatValue(
                            typeof override.currentValue === 'object'
                              ? override.currentValue?.amount?.toString()
                              : override.currentValue?.toString()
                          )}
                        </span>
                      </div>
                      
                      {override.note && (
                        <p className="text-xs text-muted-foreground italic">
                          Note: {override.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {currentOverrides.length > 0 && (auditOverrides.length > 0 || otherChanges.length > 0) && (
            <Separator />
          )}

          {/* Audit Log Section */}
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading audit trail...</div>
          ) : (
            <>
              {/* Override History */}
              {auditOverrides.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
                    <FileEdit className="h-4 w-4 text-muted-foreground" />
                    Override History
                  </h4>
                  <ScrollArea className="h-[150px]">
                    <div className="space-y-2">
                      {auditOverrides.map((entry) => (
                        <div 
                          key={entry.id} 
                          className="p-2 rounded border bg-muted/30"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">
                              {formatFieldName(entry.field_name)}
                            </span>
                            {getSourceLevel(entry.metadata) && (
                              <Badge variant="secondary" className="text-xs">
                                {getSourceLevel(entry.metadata)}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 text-xs mb-1">
                            <span className="text-muted-foreground">
                              {formatValue(entry.old_value)}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">
                              {formatValue(entry.new_value)}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span>{users?.[entry.user_id || ""] || "System"}</span>
                            <span>•</span>
                            <span>{format(new Date(entry.created_at), "d MMM HH:mm")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {auditOverrides.length > 0 && otherChanges.length > 0 && (
                <Separator />
              )}

              {/* Status Changes */}
              {otherChanges.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-3">Status Changes</h4>
                  <ScrollArea className="h-[150px]">
                    <div className="space-y-2">
                      {otherChanges.map((entry) => (
                        <div 
                          key={entry.id} 
                          className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                        >
                          <div className="flex items-center gap-2">
                            {getActionBadge(entry.action)}
                            {entry.field_name && (
                              <span className="text-xs text-muted-foreground">
                                {formatFieldName(entry.field_name)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{users?.[entry.user_id || ""] || "System"}</span>
                            <span>•</span>
                            <span>{format(new Date(entry.created_at), "d MMM HH:mm")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Empty State */}
              {(!auditLog || auditLog.length === 0) && currentOverrides.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mb-2" />
                  <p className="text-sm">No changes recorded yet</p>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}