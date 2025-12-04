import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { format } from "date-fns";
import { Plus, CreditCard } from "lucide-react";

interface CISPaymentsTabProps { selectedEntity: BookkeepingEntity | null; }

export function CISPaymentsTab({ selectedEntity }: CISPaymentsTabProps) {
  const { organization } = useOrganization();

  const { data: payments, isLoading } = useQuery({
    queryKey: ["cis-payments", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase.from("cis_payments").select("*, cis_contractors(name), cis_subcontractors(first_name, last_name, business_name)").eq("organization_id", organization.id).order("payment_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  if (isLoading) return <Skeleton className="h-[400px] w-full" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div><CardTitle>CIS Payments</CardTitle><CardDescription>Record payments to subcontractors</CardDescription></div>
        <Button><Plus className="h-4 w-4 mr-2" />Record Payment</Button>
      </CardHeader>
      <CardContent>
        {!payments?.length ? (
          <div className="text-center py-12"><CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><h3 className="text-lg font-medium mb-2">No Payments</h3><p className="text-muted-foreground">No CIS payments recorded.</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Contractor</TableHead><TableHead>Subcontractor</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Deduction</TableHead><TableHead className="text-right">Net</TableHead></TableRow></TableHeader>
            <TableBody>
              {payments.map((p) => {
                const subName = (p.cis_subcontractors as any)?.business_name || `${(p.cis_subcontractors as any)?.first_name} ${(p.cis_subcontractors as any)?.last_name}`;
                return (
                  <TableRow key={p.id}><TableCell>{format(new Date(p.payment_date), "d MMM yyyy")}</TableCell><TableCell>{(p.cis_contractors as any)?.name}</TableCell><TableCell>{subName}</TableCell><TableCell className="text-right">£{(p.gross_amount || 0).toFixed(2)}</TableCell><TableCell className="text-right text-destructive">£{(p.deduction_amount || 0).toFixed(2)}</TableCell><TableCell className="text-right font-medium">£{(p.net_amount || 0).toFixed(2)}</TableCell></TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
