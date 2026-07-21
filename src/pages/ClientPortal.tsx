import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Phone, FileText, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ClientPortalTab from "@/components/client-portal/ClientPortalTab";
import ClientJobsTab from "@/components/client-portal/ClientJobsTab";
import ClientDocumentsTab from "@/components/client-portal/ClientDocumentsTab";
import { ConversationsTab } from "@/components/client-portal/ConversationsTab";
import ClientQuestionnairesTab from "@/components/client-portal/ClientQuestionnairesTab";
import ClientWorkpapersTab from "@/components/client-portal/ClientWorkpapersTab";
import { ContactsList } from "@/components/contacts/ContactsList";
import { ClientServicesTab } from "@/components/client-portal/ClientServicesTab";
import { HmrcAuthorisationPanel } from "@/components/clients/HmrcAuthorisationPanel";
import { EngagementLetterStatus } from "@/components/clients/EngagementLetterStatus";
import { StaffAssignmentField } from "@/components/company/StaffAssignmentField";
import { ServiceStatusDashboard } from "@/components/client-portal/ServiceStatusDashboard";
import { ClientSettingsTab } from "@/components/client-portal/ClientSettingsTab";

export default function ClientPortal() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      // Join client detail tables for type-specific data
      const { data, error } = await supabase
        .from("clients")
        .select(`
          *,
          client_detail_sa(*),
          client_detail_cgt(*),
          client_detail_partnership(*),
          client_detail_charity(*)
        `)
        .eq("id", clientId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8">Loading client...</div>
      </DashboardLayout>
    );
  }

  if (!client) {
    return (
      <DashboardLayout>
        <div className="p-8">Client not found</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-auto">
        <div className="p-8 space-y-6">
          {/* Client Header */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/clients")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold">
                  {client.first_name} {client.last_name}
                </h1>
                <Badge>Individual Client</Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {client.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {client.email}
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {client.phone}
                  </div>
                )}
              </div>
              <EngagementLetterStatus clientId={clientId} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled>
                <Mail className="mr-2 h-4 w-4" />
                Send Email
              </Button>
              <Button disabled>
                <FileText className="mr-2 h-4 w-4" />
                New Job
              </Button>
            </div>
          </div>

          {/* Partner / staff in charge */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <StaffAssignmentField
              entityId={clientId!}
              entityKind="client"
              field="partner_in_charge"
              currentValue={(client as { partner_in_charge?: string | null }).partner_in_charge ?? null}
              label="Partner in Charge"
            />
            <StaffAssignmentField
              entityId={clientId!}
              entityKind="client"
              field="staff_in_charge"
              currentValue={(client as { staff_in_charge?: string | null }).staff_in_charge ?? null}
              label="Staff in Charge"
            />
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="flex-wrap">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="conversations">Conversations</TabsTrigger>
              <TabsTrigger value="jobs">Jobs</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
              <TabsTrigger value="questionnaires">Questionnaires</TabsTrigger>
              <TabsTrigger value="workpapers">Workpapers</TabsTrigger>
              <TabsTrigger value="services">Services</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="space-y-6">
                <ClientPortalTab clientId={client.id} onViewConversations={() => setActiveTab("conversations")} />
                <HmrcAuthorisationPanel clientId={client.id} />
              </div>
            </TabsContent>

            <TabsContent value="conversations">
              <ConversationsTab clientId={client.id} />
            </TabsContent>

            <TabsContent value="jobs">
              <ClientJobsTab clientId={client.id} />
            </TabsContent>

            <TabsContent value="documents">
              <ClientDocumentsTab clientId={client.id} />
            </TabsContent>

            <TabsContent value="contacts">
              <ContactsList clientId={client.id} />
            </TabsContent>

            <TabsContent value="questionnaires">
              <ClientQuestionnairesTab clientId={client.id} />
            </TabsContent>

            <TabsContent value="workpapers">
              <ClientWorkpapersTab clientId={client.id} />
            </TabsContent>

            <TabsContent value="services">
              <ClientServicesTab clientId={client.id} />
            </TabsContent>

            <TabsContent value="settings">
              <ClientSettingsTab
                entityId={client.id}
                entityKind="client"
                status={(client as any).status}
                archivedAt={(client as any).archived_at}
                disengagedAt={(client as any).disengaged_at}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
