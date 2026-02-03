import { useState, useMemo } from "react";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, User, Link2, UserPlus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddClientDialog } from "@/components/clients/AddClientDialog";
import { ClientTypeFilters } from "@/components/clients/ClientTypeFilters";
import DashboardLayout from "@/components/DashboardLayout";
import LinkedClientsTab from "@/components/accountant-linking/LinkedClientsTab";
import LinkToExistingClientDialog from "@/components/accountant-linking/LinkToExistingClientDialog";
import {
  CLIENT_TYPE_LABELS,
  COMPANY_BASED_TYPES,
  type ClientType,
} from "@/lib/client-types";

const Clients = () => {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState("");
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("individuals");
  const [typeFilter, setTypeFilter] = useState<ClientType | null>(null);

  const { data: clients, isLoading: clientsLoading } = useQuery({
    queryKey: ["clients", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("clients")
        .select(`
          *,
          client_detail_sa(*),
          client_detail_cgt(*),
          client_detail_partnership(*),
          client_detail_charity(*)
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const { data: companies, isLoading: companiesLoading } = useQuery({
    queryKey: ["companies", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  // Compute type counts for individuals
  const individualTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    clients?.forEach((c) => {
      const type = c.client_type || "other";
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [clients]);

  // Compute type counts for companies
  const companyTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    companies?.forEach((c) => {
      // Map company_type to our ClientType enum
      let type: ClientType = "limited_company";
      if (c.company_type === "llp") {
        type = "llp";
      } else if (c.company_type === "charity") {
        type = "charity";
      }
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [companies]);

  const filteredClients = useMemo(() => {
    return clients?.filter((client) => {
      const matchesSearch = `${client.first_name} ${client.last_name} ${client.email}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesType = !typeFilter || client.client_type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [clients, searchTerm, typeFilter]);

  const filteredCompanies = useMemo(() => {
    return companies?.filter((company) => {
      const matchesSearch = `${company.company_name} ${company.email}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      
      if (!typeFilter) return matchesSearch;
      
      // Map company_type to ClientType for filtering
      let companyType: ClientType = "limited_company";
      if (company.company_type === "llp") {
        companyType = "llp";
      } else if (company.company_type === "charity") {
        companyType = "charity";
      }
      
      return matchesSearch && companyType === typeFilter;
    });
  }, [companies, searchTerm, typeFilter]);

  // Reset type filter when switching tabs
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setTypeFilter(null);
  };

  // Get display label for client type
  const getClientTypeLabel = (type: string | null): string => {
    if (!type) return "-";
    return CLIENT_TYPE_LABELS[type as ClientType] || type;
  };

  // Get display label for company type
  const getCompanyTypeLabel = (companyType: string | null): string => {
    if (companyType === "llp") return CLIENT_TYPE_LABELS.llp;
    if (companyType === "charity") return CLIENT_TYPE_LABELS.charity;
    return CLIENT_TYPE_LABELS.limited_company;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Clients</h1>
            <p className="text-muted-foreground mt-1">
              Manage your client relationships
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowLinkDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Link Existing
            </Button>
            <AddClientDialog />
          </div>
        </div>

        <div className="flex gap-4">
          <Input
            placeholder="Search clients and companies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList>
            <TabsTrigger value="individuals">
              <User className="h-4 w-4 mr-2" />
              Individuals ({clients?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="companies">
              <Building2 className="h-4 w-4 mr-2" />
              Companies ({companies?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="linked">
              <Link2 className="h-4 w-4 mr-2" />
              Portal Links
            </TabsTrigger>
          </TabsList>

          <TabsContent value="individuals" className="space-y-4">
            <ClientTypeFilters
              activeType={typeFilter}
              onTypeChange={setTypeFilter}
              typeCounts={individualTypeCounts}
              mode="individual"
            />
            {clientsLoading ? (
              <div className="text-center py-12">Loading clients...</div>
            ) : !filteredClients?.length ? (
              <div className="text-center py-12 border border-dashed rounded-lg">
                <p className="text-muted-foreground">
                  {typeFilter ? "No clients match this filter" : "No individual clients yet"}
                </p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.map((client) => (
                      <TableRow
                        key={client.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/clients/${client.id}`)}
                      >
                        <TableCell className="font-medium">
                          {client.first_name} {client.last_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getClientTypeLabel(client.client_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>{client.email}</TableCell>
                        <TableCell>{client.phone || "-"}</TableCell>
                        <TableCell>
                          {client.city ? `${client.city}, ${client.country}` : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="companies" className="space-y-4">
            <ClientTypeFilters
              activeType={typeFilter}
              onTypeChange={setTypeFilter}
              typeCounts={companyTypeCounts}
              mode="company"
            />
            {companiesLoading ? (
              <div className="text-center py-12">Loading companies...</div>
            ) : !filteredCompanies?.length ? (
              <div className="text-center py-12 border border-dashed rounded-lg">
                <p className="text-muted-foreground">
                  {typeFilter ? "No companies match this filter" : "No company clients yet"}
                </p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Company Number</TableHead>
                      <TableHead>Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies.map((company) => (
                      <TableRow
                        key={company.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/companies/${company.id}`)}
                      >
                        <TableCell className="font-medium">
                          {company.company_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getCompanyTypeLabel(company.company_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>{company.email}</TableCell>
                        <TableCell>{company.phone || "-"}</TableCell>
                        <TableCell>
                          {company.company_number ? (
                            <Badge variant="outline">{company.company_number}</Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          {company.city ? `${company.city}, ${company.country}` : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="linked">
            <LinkedClientsTab />
          </TabsContent>
        </Tabs>

        <LinkToExistingClientDialog
          open={showLinkDialog}
          onOpenChange={setShowLinkDialog}
        />
      </div>
    </DashboardLayout>
  );
};

export default Clients;
