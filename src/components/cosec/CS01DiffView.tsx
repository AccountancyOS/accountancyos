import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  User,
  Building2,
  ArrowRight,
  Minus,
  Plus
} from "lucide-react";
import { format } from "date-fns";
import { CHDiscrepancy, CHOfficer, CHPSC, formatOfficerRole, formatNatureOfControl } from "@/lib/ch-sync-service";

interface CS01DiffViewProps {
  companyId: string;
  internalOfficers: any[];
  internalPSCs: any[];
  chOfficers: CHOfficer[];
  chPSCs: CHPSC[];
  discrepancies: CHDiscrepancy[];
  onSync: () => void;
  isSyncing: boolean;
}

export function CS01DiffView({
  companyId,
  internalOfficers,
  internalPSCs,
  chOfficers,
  chPSCs,
  discrepancies,
  onSync,
  isSyncing,
}: CS01DiffViewProps) {
  // Group discrepancies by type
  const officerDiscrepancies = discrepancies.filter(
    d => d.type === "officer_missing_internal" || d.type === "officer_missing_ch"
  );
  const pscDiscrepancies = discrepancies.filter(
    d => d.type === "psc_missing_internal" || d.type === "psc_missing_ch" || d.type === "psc_control_mismatch"
  );

  const noDiscrepancies = discrepancies.length === 0;

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <Card className={noDiscrepancies ? "border-green-300 dark:border-green-700" : "border-amber-300 dark:border-amber-700"}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {noDiscrepancies ? (
                <>
                  <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-green-800 dark:text-green-200">
                      Registers Match Companies House
                    </h3>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      No discrepancies found. Ready to file CS01.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                    <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                      {discrepancies.length} Discrepancies Found
                    </h3>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Resolve these differences before filing CS01.
                    </p>
                  </div>
                </>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={onSync} disabled={isSyncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
              Re-sync
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Officers Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Officers Comparison
            {officerDiscrepancies.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {officerDiscrepancies.length} issues
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Comparing {internalOfficers.length} internal records with {chOfficers.length} CH records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            {/* Internal Side */}
            <div>
              <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Internal Register
              </h4>
              <div className="space-y-2">
                {internalOfficers.length > 0 ? (
                  internalOfficers.map((officer: any) => {
                    const matchedInCH = chOfficers.some(
                      ch => normalizeNameForComparison(ch.name) === 
                            normalizeNameForComparison(`${officer.person?.first_name} ${officer.person?.last_name}`)
                    );
                    return (
                      <div 
                        key={officer.id} 
                        className={`p-3 rounded-lg border ${
                          matchedInCH 
                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
                            : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">
                              {officer.person?.first_name} {officer.person?.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">{officer.role}</p>
                            <p className="text-xs text-muted-foreground">
                              Appointed: {format(new Date(officer.appointed_at), "d MMM yyyy")}
                            </p>
                          </div>
                          {matchedInCH ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <div className="flex items-center gap-1 text-amber-600">
                              <Minus className="h-3 w-3" />
                              <span className="text-xs">Not in CH</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                    No officers recorded
                  </p>
                )}
              </div>
            </div>

            {/* CH Side */}
            <div>
              <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-500" />
                Companies House
              </h4>
              <div className="space-y-2">
                {chOfficers.length > 0 ? (
                  chOfficers.filter(ch => !ch.resigned_on).map((chOfficer, idx) => {
                    const matchedInternal = internalOfficers.some(
                      int => normalizeNameForComparison(`${int.person?.first_name} ${int.person?.last_name}`) === 
                             normalizeNameForComparison(chOfficer.name)
                    );
                    return (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-lg border ${
                          matchedInternal 
                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
                            : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">{chOfficer.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatOfficerRole(chOfficer.officer_role)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Appointed: {format(new Date(chOfficer.appointed_on), "d MMM yyyy")}
                            </p>
                          </div>
                          {matchedInternal ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <div className="flex items-center gap-1 text-red-600">
                              <Plus className="h-3 w-3" />
                              <span className="text-xs">Missing Internal</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                    No officers from CH
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PSCs Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            PSCs Comparison
            {pscDiscrepancies.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {pscDiscrepancies.length} issues
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Comparing {internalPSCs.length} internal records with {chPSCs.length} CH records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            {/* Internal Side */}
            <div>
              <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Internal Register
              </h4>
              <div className="space-y-2">
                {internalPSCs.length > 0 ? (
                  internalPSCs.map((psc: any) => {
                    const matchedInCH = chPSCs.some(
                      ch => normalizeNameForComparison(ch.name) === 
                            normalizeNameForComparison(`${psc.person?.first_name} ${psc.person?.last_name}`)
                    );
                    return (
                      <div 
                        key={psc.id} 
                        className={`p-3 rounded-lg border ${
                          matchedInCH 
                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
                            : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">
                              {psc.person?.first_name} {psc.person?.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatNatureOfControl(psc.nature_of_control || []).slice(0, 2).join(", ")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Notified: {format(new Date(psc.notified_at), "d MMM yyyy")}
                            </p>
                          </div>
                          {matchedInCH ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <div className="flex items-center gap-1 text-amber-600">
                              <Minus className="h-3 w-3" />
                              <span className="text-xs">Not in CH</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                    No PSCs recorded
                  </p>
                )}
              </div>
            </div>

            {/* CH Side */}
            <div>
              <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-500" />
                Companies House
              </h4>
              <div className="space-y-2">
                {chPSCs.length > 0 ? (
                  chPSCs.filter(ch => !ch.ceased_on).map((chPSC, idx) => {
                    const matchedInternal = internalPSCs.some(
                      int => normalizeNameForComparison(`${int.person?.first_name} ${int.person?.last_name}`) === 
                             normalizeNameForComparison(chPSC.name)
                    );
                    return (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-lg border ${
                          matchedInternal 
                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
                            : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">{chPSC.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatNatureOfControl(chPSC.natures_of_control).slice(0, 2).join(", ")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Notified: {format(new Date(chPSC.notified_on), "d MMM yyyy")}
                            </p>
                          </div>
                          {matchedInternal ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <div className="flex items-center gap-1 text-red-600">
                              <Plus className="h-3 w-3" />
                              <span className="text-xs">Missing Internal</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                    No PSCs from CH
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Discrepancy Details */}
      {discrepancies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Discrepancy Details</CardTitle>
            <CardDescription>
              Actions required to align internal registers with Companies House
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {discrepancies.map((disc, idx) => (
                <div 
                  key={idx} 
                  className="flex items-start gap-3 p-3 rounded-lg border bg-muted/50"
                >
                  <div className="p-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{disc.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {getDiscrepancyAction(disc.type)}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {getDiscrepancyForm(disc.type)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function normalizeNameForComparison(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

function getDiscrepancyAction(type: string): string {
  switch (type) {
    case "officer_missing_internal":
      return "Add officer to internal register or file termination with CH";
    case "officer_missing_ch":
      return "File AP01 to notify CH of appointment";
    case "psc_missing_internal":
      return "Add PSC to internal register or file cessation with CH";
    case "psc_missing_ch":
      return "File PSC01 to notify CH of PSC";
    case "psc_control_mismatch":
      return "File PSC04 to update nature of control";
    default:
      return "Review and resolve";
  }
}

function getDiscrepancyForm(type: string): string {
  switch (type) {
    case "officer_missing_internal":
      return "TM01/TM02";
    case "officer_missing_ch":
      return "AP01";
    case "psc_missing_internal":
      return "PSC07";
    case "psc_missing_ch":
      return "PSC01";
    case "psc_control_mismatch":
      return "PSC04";
    default:
      return "Review";
  }
}
