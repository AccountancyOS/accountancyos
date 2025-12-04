import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Layers, Check, X } from "lucide-react";
import { AddShareClassDialog } from "./AddShareClassDialog";

interface ShareClassesSectionProps {
  companyId: string;
  organizationId: string;
}

export function ShareClassesSection({ companyId, organizationId }: ShareClassesSectionProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: shareClasses, isLoading } = useQuery({
    queryKey: ["company-share-classes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_share_classes")
        .select("*")
        .eq("company_id", companyId)
        .order("class_name");

      if (error) throw error;
      return data;
    },
  });

  // Calculate totals
  const totalShares = shareClasses?.reduce((sum, sc) => sum + Number(sc.total_shares_issued || 0), 0) || 0;
  const totalCapital = shareClasses?.reduce((sum, sc) => 
    sum + (Number(sc.total_shares_issued || 0) * Number(sc.nominal_value || 0)), 0
  ) || 0;

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading share classes...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{shareClasses?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Share Classes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{totalShares.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total Shares Issued</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              £{totalCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Total Share Capital</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Share Classes
            </CardTitle>
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Share Class
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!shareClasses || shareClasses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No share classes defined. Add share classes to record shareholdings.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class Name</TableHead>
                  <TableHead className="text-right">Nominal Value</TableHead>
                  <TableHead className="text-right">Shares Issued</TableHead>
                  <TableHead className="text-right">Total Capital</TableHead>
                  <TableHead className="text-center">Voting</TableHead>
                  <TableHead className="text-center">Dividends</TableHead>
                  <TableHead className="text-center">Capital</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shareClasses.map((sc) => (
                  <TableRow key={sc.id}>
                    <TableCell className="font-medium">{sc.class_name}</TableCell>
                    <TableCell className="text-right">
                      {sc.currency} {Number(sc.nominal_value).toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(sc.total_shares_issued || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {sc.currency} {(Number(sc.total_shares_issued || 0) * Number(sc.nominal_value)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">
                      {sc.voting_rights ? <Check className="h-4 w-4 text-green-600 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />}
                    </TableCell>
                    <TableCell className="text-center">
                      {sc.dividend_rights ? <Check className="h-4 w-4 text-green-600 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />}
                    </TableCell>
                    <TableCell className="text-center">
                      {sc.capital_rights ? <Check className="h-4 w-4 text-green-600 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground mx-auto" />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddShareClassDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        companyId={companyId}
      />
    </div>
  );
}
