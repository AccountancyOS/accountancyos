import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, UserCircle, AlertCircle, CheckCircle } from "lucide-react";
import { formatOfficerRole, CHOfficer } from "@/lib/ch-sync-service";
import { format } from "date-fns";
import { AddPersonDialog } from "./AddPersonDialog";

interface OfficersSectionProps {
  companyId: string;
  organizationId: string;
  chOfficers?: CHOfficer[];
}

export function OfficersSection({ companyId, organizationId, chOfficers }: OfficersSectionProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: officers, isLoading } = useQuery({
    queryKey: ["company-officers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_officers")
        .select(`
          id,
          role,
          appointed_at,
          resigned_at,
          ch_appointment_id,
          person:company_persons(
            id,
            title,
            first_name,
            last_name,
            date_of_birth,
            nationality,
            country_of_residence,
            occupation,
            service_address_line_1,
            service_city,
            service_postcode
          )
        `)
        .eq("company_id", companyId)
        .order("appointed_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const activeOfficers = officers?.filter(o => !o.resigned_at) || [];
  const formerOfficers = officers?.filter(o => o.resigned_at) || [];

  // Check if officer exists in CH data
  const isInCH = (officer: any): boolean => {
    if (!chOfficers) return true; // No CH data, assume synced
    const name = `${officer.person?.last_name}, ${officer.person?.first_name}`.toUpperCase();
    return chOfficers.some(cho => 
      cho.name.toUpperCase() === name || 
      cho.name.toUpperCase().includes(officer.person?.last_name?.toUpperCase() || "")
    );
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading officers...</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCircle className="h-5 w-5" />
              Current Officers ({activeOfficers.length})
            </CardTitle>
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Officer
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {activeOfficers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No officers registered. Add officers to the register.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Appointed</TableHead>
                  <TableHead>Nationality</TableHead>
                  <TableHead>Occupation</TableHead>
                  <TableHead className="text-right">CH Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeOfficers.map((officer) => (
                  <TableRow key={officer.id}>
                    <TableCell className="font-medium">
                      {officer.person?.title} {officer.person?.first_name} {officer.person?.last_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {formatOfficerRole(officer.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {officer.appointed_at && format(new Date(officer.appointed_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>{officer.person?.nationality || "-"}</TableCell>
                    <TableCell>{officer.person?.occupation || "-"}</TableCell>
                    <TableCell className="text-right">
                      {isInCH(officer) ? (
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

      {/* Former Officers */}
      {formerOfficers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground">
              Former Officers ({formerOfficers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Appointed</TableHead>
                  <TableHead>Resigned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formerOfficers.map((officer) => (
                  <TableRow key={officer.id} className="text-muted-foreground">
                    <TableCell>
                      {officer.person?.title} {officer.person?.first_name} {officer.person?.last_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{formatOfficerRole(officer.role)}</Badge>
                    </TableCell>
                    <TableCell>
                      {officer.appointed_at && format(new Date(officer.appointed_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      {officer.resigned_at && format(new Date(officer.resigned_at), "dd MMM yyyy")}
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
        type="officer"
      />
    </div>
  );
}
