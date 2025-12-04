import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { Plus, Building2 } from "lucide-react";

interface CISContractorsTabProps { selectedEntity: BookkeepingEntity | null; }

export function CISContractorsTab({ selectedEntity }: CISContractorsTabProps) {
  const { organization } = useOrganization();

  const { data: contractors, isLoading } = useQuery({
    queryKey: ["cis-contractors", organization?.id, selectedEntity?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      let query = supabase.from("cis_contractors").select("*").eq("organization_id", organization.id);
      if (selectedEntity?.type === "company") query = query.eq("company_id", selectedEntity.id);
      else if (selectedEntity?.type === "client") query = query.eq("client_id", selectedEntity.id);
      const { data, error } = await query.order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  if (isLoading) return <Skeleton className="h-[400px] w-full" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div><CardTitle>CIS Contractors</CardTitle><CardDescription>Manage contractor registrations</CardDescription></div>
        <Button><Plus className="h-4 w-4 mr-2" />Add Contractor</Button>
      </CardHeader>
      <CardContent>
        {!contractors?.length ? (
          <div className="text-center py-12"><Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><h3 className="text-lg font-medium mb-2">No Contractors</h3><p className="text-muted-foreground">No CIS contractors configured.</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>UTR</TableHead><TableHead>A/O Reference</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {contractors.map((c) => (
                <TableRow key={c.id}><TableCell className="font-medium">{c.name}</TableCell><TableCell className="font-mono">{c.contractor_utr}</TableCell><TableCell className="font-mono">{c.accounts_office_reference || '-'}</TableCell><TableCell><Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Active" : "Inactive"}</Badge></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
