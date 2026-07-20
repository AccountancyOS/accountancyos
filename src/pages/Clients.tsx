import { useState, useMemo } from "react";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { QueryError } from "@/components/QueryError";
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
import { ClientTypeFilters } from "@/components/clients/ClientTypeFilters";
import DashboardLayout from "@/components/DashboardLayout";
import LinkedClientsTab from "@/components/accountant-linking/LinkedClientsTab";
import LinkToExistingClientDialog from "@/components/accountant-linking/LinkToExistingClientDialog";
import {
  getClientTypeLabel,
  normalizeClientType,
  type ClientType,
} from "@/lib/client-types";
import { TableSkeleton } from "@/components/ui/table-skeleton";

interface UnifiedClient {
  id: string;
  name: string;
  type: ClientType;
  email: string | null;
  phone: string | null;
  location: string;
  kind: "individual" | "company";
  companyNumber?: string | null;
}

const Clients = () => {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState("");
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [typeFilter, setTypeFilter] = useState<ClientType | null>(null);

  const { data: clients, isLoading: clientsLoading, isError: clientsError, refetch: refetchClients } = useQuery({
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

  const { data: companies, isLoading: companiesLoading, isError: companiesError, refetch: refetchCompanies } = useQuery({
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

  const unifiedList = useMemo<UnifiedClient[]>(() => {
    const items: UnifiedClient[] = [];

    clients?.forEach((c) => {
      items.push({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`,
        type: normalizeClientType(c.client_type),
        email: c.email,
        phone: c.phone,
        location: c.city ? `${c.city}, ${c.country}` : "-",
        kind: "individual",
      });
    });

    companies?.forEach((c) => {
      let type: ClientType = "limited_company";
      if (c.company_type === "llp") type = "llp";
      else if (c.company_type === "charity") type = "charity";

      items.push({
        id: c.id,
        name: c.company_name,
        type,
        email: c.email,
        phone: c.phone,
        location: c.city ? `${c.city}, ${c.country}` : "-",
        kind: "company",
        companyNumber: c.company_number,
      });
    });

    return items;
  }, [clients, companies]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    unifiedList.forEach((item) => {
      counts[item.type] = (counts[item.type] || 0) + 1;
    });
    return counts;
  }, [unifiedList]);

  const filteredList = useMemo(() => {
    return unifiedList.filter((item) => {
      const matchesSearch = `${item.name} ${item.email || ""}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesType = !typeFilter || item.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [unifiedList, searchTerm, typeFilter]);

  const isLoading = clientsLoading || companiesLoading;
  const isError = clientsError || companiesError;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Clients</h1>
            <p className="text-muted-foreground mt-1">
              Manage your client relationships
            </p>
          </div>
          <div className="flex gap-2">
            {/* Direct "Add Client" removed intentionally: new clients must originate in the CRM and
                go through formal onboarding, not be created ad-hoc from the client list. Linking to
                an already-existing client remains available. */}
            <Button variant="outline" onClick={() => setShowLinkDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Link Existing
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="all">
                All Clients ({unifiedList.length})
              </TabsTrigger>
              <TabsTrigger value="linked">
                <Link2 className="h-4 w-4 mr-2" />
                Portal Links
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="all" className="space-y-4">
            <div className="flex gap-4">
              <Input
                placeholder="Search clients and companies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>

            <ClientTypeFilters
              activeType={typeFilter}
              onTypeChange={setTypeFilter}
              typeCounts={typeCounts}
            />

            {isLoading ? (
              <TableSkeleton columns={5} rows={6} />
            ) : isError ? (
              <QueryError entity="clients" onRetry={() => { refetchClients(); refetchCompanies(); }} />
            ) : !filteredList.length ? (
              <div className="text-center py-12 border border-dashed rounded-lg">
                <p className="text-muted-foreground">
                  {typeFilter ? "No clients match this filter" : "No clients yet"}
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
                    {filteredList.map((item) => (
                      <TableRow
                        key={`${item.kind}-${item.id}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          navigate(
                            item.kind === "company"
                              ? `/companies/${item.id}`
                              : `/clients/${item.id}`
                          )
                        }
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {item.kind === "company" ? (
                              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                              <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            {item.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getClientTypeLabel(item.type)}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.email || "-"}</TableCell>
                        <TableCell>{item.phone || "-"}</TableCell>
                        <TableCell>{item.location}</TableCell>
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
