import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { AddPayeSchemeDialog } from "./AddPayeSchemeDialog";
import { Plus, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PayeSchemesTabProps {
  selectedEntity: BookkeepingEntity | null;
}

export function PayeSchemesTab({ selectedEntity }: PayeSchemesTabProps) {
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: schemes, isLoading, refetch } = useQuery({
    queryKey: ["paye-schemes", organization?.id, selectedEntity?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      let query = supabase
        .from("paye_schemes")
        .select(`
          id,
          name,
          employer_paye_reference,
          accounts_office_reference,
          is_active,
          company_id,
          client_id,
          companies (id, company_name),
          clients (id, first_name, last_name)
        `)
        .eq("organization_id", organization.id);

      if (selectedEntity) {
        if (selectedEntity.type === "company") {
          query = query.eq("company_id", selectedEntity.id);
        } else {
          query = query.eq("client_id", selectedEntity.id);
        }
      }

      const { data, error } = await query.order("employer_paye_reference");
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>PAYE Schemes</CardTitle>
          <CardDescription>
            Manage employer PAYE schemes and registration details
          </CardDescription>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add PAYE Scheme
        </Button>
      </CardHeader>
      <CardContent>
        {!schemes?.length ? (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No PAYE Schemes</h3>
            <p className="text-muted-foreground mb-4">
              {selectedEntity 
                ? "No PAYE schemes configured for this employer." 
                : "Select an employer or add a new PAYE scheme."}
            </p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add PAYE Scheme
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employer</TableHead>
                <TableHead>PAYE Reference</TableHead>
                <TableHead>Accounts Office Ref</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schemes.map((scheme) => {
                const employerName = scheme.companies?.company_name || 
                  (scheme.clients ? `${scheme.clients.first_name} ${scheme.clients.last_name}` : 'Unknown');
                const entityType = scheme.company_id ? 'company' : 'client';
                const entityId = scheme.company_id || scheme.client_id;

                return (
                  <TableRow key={scheme.id}>
                    <TableCell>
                      <button
                        className="font-medium text-primary hover:underline text-left"
                        onClick={() => {
                          if (entityType === 'company' && entityId) {
                            navigate(`/companies/${entityId}`);
                          }
                        }}
                      >
                        {employerName}
                      </button>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({entityType})
                      </span>
                    </TableCell>
                    <TableCell className="font-mono">{scheme.employer_paye_reference}</TableCell>
                    <TableCell className="font-mono">
                      {scheme.accounts_office_reference || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={scheme.is_active ? "default" : "secondary"}>
                        {scheme.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AddPayeSchemeDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={() => {
          refetch();
          setShowAddDialog(false);
        }}
        preSelectedEntity={selectedEntity}
      />
    </Card>
  );
}