import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Shield, AlertCircle, CheckCircle } from "lucide-react";
import { formatNatureOfControl, CHPSC } from "@/lib/ch-sync-service";
import { format } from "date-fns";
import { AddPersonDialog } from "./AddPersonDialog";

interface PSCsSectionProps {
  companyId: string;
  organizationId: string;
  chPSCs?: CHPSC[];
}

export function PSCsSection({ companyId, organizationId, chPSCs }: PSCsSectionProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: pscs, isLoading } = useQuery({
    queryKey: ["company-pscs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_pscs")
        .select(`
          id,
          nature_of_control,
          notified_at,
          ceased_at,
          ch_psc_id,
          person:company_persons(
            id,
            title,
            first_name,
            last_name,
            date_of_birth,
            nationality,
            country_of_residence
          )
        `)
        .eq("company_id", companyId)
        .order("notified_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const activePSCs = pscs?.filter(p => !p.ceased_at) || [];
  const ceasedPSCs = pscs?.filter(p => p.ceased_at) || [];

  // Check if PSC exists in CH data
  const isInCH = (psc: any): boolean => {
    if (!chPSCs) return true;
    const name = `${psc.person?.first_name} ${psc.person?.last_name}`.toLowerCase();
    return chPSCs.some(chp => 
      chp.name.toLowerCase().includes(name) || 
      name.includes(chp.name.toLowerCase().replace(/^(mr|mrs|ms|miss|dr)\s+/i, ''))
    );
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading PSCs...</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Persons with Significant Control ({activePSCs.length})
            </CardTitle>
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add PSC
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {activePSCs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No PSCs registered. Add PSCs to the register.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Nature of Control</TableHead>
                  <TableHead>Notified</TableHead>
                  <TableHead>Nationality</TableHead>
                  <TableHead className="text-right">CH Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePSCs.map((psc) => (
                  <TableRow key={psc.id}>
                    <TableCell className="font-medium">
                      {psc.person?.title} {psc.person?.first_name} {psc.person?.last_name}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {formatNatureOfControl(psc.nature_of_control || []).map((control, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {control}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {psc.notified_at && format(new Date(psc.notified_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>{psc.person?.nationality || "-"}</TableCell>
                    <TableCell className="text-right">
                      {isInCH(psc) ? (
                        <Badge variant="outline" className="gap-1 text-green-600 border-green-200">
                          <CheckCircle className="h-3 w-3" />
                          Synced
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200">
                          <AlertCircle className="h-3 w-3" />
                          Not in CH
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Ceased PSCs */}
      {ceasedPSCs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground">
              Ceased PSCs ({ceasedPSCs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Nature of Control</TableHead>
                  <TableHead>Notified</TableHead>
                  <TableHead>Ceased</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ceasedPSCs.map((psc) => (
                  <TableRow key={psc.id} className="text-muted-foreground">
                    <TableCell>
                      {psc.person?.title} {psc.person?.first_name} {psc.person?.last_name}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {formatNatureOfControl(psc.nature_of_control || []).map((control, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {control}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {psc.notified_at && format(new Date(psc.notified_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      {psc.ceased_at && format(new Date(psc.ceased_at), "dd MMM yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AddPersonDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        companyId={companyId}
        organizationId={organizationId}
        type="psc"
      />
    </div>
  );
}
