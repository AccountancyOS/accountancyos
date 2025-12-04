import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { CIS_DEDUCTION_RATE_LABELS, type CISDeductionRate } from "@/lib/payroll-constants";
import { Plus, Users } from "lucide-react";

interface CISSubcontractorsTabProps { selectedEntity: BookkeepingEntity | null; }

export function CISSubcontractorsTab({ selectedEntity }: CISSubcontractorsTabProps) {
  const { organization } = useOrganization();

  const { data: subcontractors, isLoading } = useQuery({
    queryKey: ["cis-subcontractors", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase.from("cis_subcontractors").select("*, cis_contractors(name)").eq("organization_id", organization.id).order("last_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  if (isLoading) return <Skeleton className="h-[400px] w-full" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div><CardTitle>Subcontractors</CardTitle><CardDescription>Manage subcontractor records and verification</CardDescription></div>
        <Button><Plus className="h-4 w-4 mr-2" />Add Subcontractor</Button>
      </CardHeader>
      <CardContent>
        {!subcontractors?.length ? (
          <div className="text-center py-12"><Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><h3 className="text-lg font-medium mb-2">No Subcontractors</h3><p className="text-muted-foreground">No subcontractors registered.</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Contractor</TableHead><TableHead>UTR</TableHead><TableHead>Verification</TableHead><TableHead>Rate</TableHead></TableRow></TableHeader>
            <TableBody>
              {subcontractors.map((s) => {
                const name = s.business_name || s.trading_name || `${s.first_name} ${s.last_name}`;
                const rate = (s.deduction_rate || 'standard') as CISDeductionRate;
                return (
                  <TableRow key={s.id}><TableCell className="font-medium">{name}</TableCell><TableCell>{(s.cis_contractors as any)?.name || '-'}</TableCell><TableCell className="font-mono">{s.utr || '-'}</TableCell><TableCell><Badge variant={s.verification_status === 'verified' ? "default" : "secondary"}>{s.verification_status}</Badge></TableCell><TableCell>{CIS_DEDUCTION_RATE_LABELS[rate]}</TableCell></TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
