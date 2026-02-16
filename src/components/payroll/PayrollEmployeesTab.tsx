import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { AddEmployeeDialog } from "./AddEmployeeDialog";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Users } from "lucide-react";
import { formatStatus } from "@/lib/format-utils";

interface PayrollEmployeesTabProps {
  selectedEntity: BookkeepingEntity | null;
  selectedSchemeId: string | null;
}

export function PayrollEmployeesTab({ selectedEntity, selectedSchemeId }: PayrollEmployeesTabProps) {
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const { data: employees, isLoading, refetch } = useQuery({
    queryKey: ["payroll-employees", organization?.id, selectedEntity?.id, selectedSchemeId, statusFilter],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      let query = supabase
        .from("employees")
        .select(`
          id,
          first_name,
          last_name,
          tax_code,
          nic_category,
          status,
          leaving_date,
          employee_reference,
          paye_scheme_id,
          paye_schemes (
            id,
            employer_paye_reference,
            company_id,
            client_id,
            companies (company_name),
            clients (first_name, last_name)
          )
        `)
        .eq("organization_id", organization.id);

      if (statusFilter === "active") {
        query = query.eq("status", "active");
      } else if (statusFilter === "leaver") {
        query = query.not("leaving_date", "is", null);
      }

      if (selectedSchemeId) {
        query = query.eq("paye_scheme_id", selectedSchemeId);
      }

      const { data, error } = await query.order("last_name");
      if (error) throw error;
      
      // Filter by entity if needed
      if (selectedEntity && !selectedSchemeId) {
        return data?.filter(emp => {
          const scheme = emp.paye_schemes as any;
          if (selectedEntity.type === "company") {
            return scheme?.company_id === selectedEntity.id;
          }
          return scheme?.client_id === selectedEntity.id;
        }) || [];
      }
      
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const filteredEmployees = employees?.filter(emp => {
    if (!searchTerm) return true;
    const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
    return fullName.includes(searchTerm.toLowerCase()) || 
           emp.employee_reference?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Employees</CardTitle>
          <CardDescription>
            Manage employee records and payroll details
          </CardDescription>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Employee
        </Button>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="leaver">Leavers</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!filteredEmployees?.length ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Employees</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm 
                ? "No employees match your search." 
                : "No employees found. Add your first employee."}
            </p>
            {!searchTerm && (
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Employer</TableHead>
                <TableHead>Tax Code</TableHead>
                <TableHead>NI Category</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map((employee) => {
                const scheme = employee.paye_schemes as any;
                const employerName = scheme?.companies?.company_name || 
                  (scheme?.clients ? `${scheme.clients.first_name} ${scheme.clients.last_name}` : '-');

                return (
                  <TableRow 
                    key={employee.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/payroll/employees/${employee.id}`)}
                  >
                    <TableCell className="font-medium">
                      {employee.first_name} {employee.last_name}
                    </TableCell>
                    <TableCell>{employerName}</TableCell>
                    <TableCell className="font-mono">{employee.tax_code || '1257L'}</TableCell>
                    <TableCell>{employee.nic_category || 'A'}</TableCell>
                    <TableCell>
                      <Badge variant={employee.status === 'active' ? "default" : "secondary"}>
                        {employee.status === 'active' ? "Active" : formatStatus(employee.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AddEmployeeDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={() => {
          refetch();
          setShowAddDialog(false);
        }}
        preSelectedSchemeId={selectedSchemeId}
      />
    </Card>
  );
}