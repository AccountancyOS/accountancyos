import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import ClientBankingTab from "@/components/client-portal/ClientBankingTab";
import { ContactsList } from "@/components/contacts/ContactsList";

export default function ClientPortal() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { organization } = useOrganization();

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase
        .from("clients")
        .select("*")
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

          {/* Tabs */}
          <Tabs defaultValue="portal" className="space-y-6">
            <TabsList className="flex-wrap">
              <TabsTrigger value="portal">Portal</TabsTrigger>
              <TabsTrigger value="conversations">Conversations</TabsTrigger>
              <TabsTrigger value="jobs">Jobs</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
              <TabsTrigger value="questionnaires">Questionnaires</TabsTrigger>
              <TabsTrigger value="workpapers">Workpapers</TabsTrigger>
              <TabsTrigger value="banking">Banking</TabsTrigger>
              <TabsTrigger value="deadlines">Deadlines</TabsTrigger>
              <TabsTrigger value="services">Services</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="portal">
              <ClientPortalTab clientId={client.id} />
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

            <TabsContent value="banking">
              <ClientBankingTab clientId={client.id} />
            </TabsContent>

            <TabsContent value="deadlines">
              <Card>
                <CardHeader>
                  <CardTitle>Upcoming Deadlines</CardTitle>
                  <CardDescription>
                    Key statutory and service deadlines for this client
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">Deadlines view coming soon...</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="services">
              <Card>
                <CardHeader>
                  <CardTitle>Active Services</CardTitle>
                  <CardDescription>
                    Services and engagements for this client
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">Services view coming soon...</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="billing">
              <Card>
                <CardHeader>
                  <CardTitle>Billing & Invoices</CardTitle>
                  <CardDescription>
                    View quotes, invoices, and payment history
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">Billing view coming soon...</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings">
              <Card>
                <CardHeader>
                  <CardTitle>Client Settings</CardTitle>
                  <CardDescription>
                    Manage client-specific configuration
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">Settings view coming soon...</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
