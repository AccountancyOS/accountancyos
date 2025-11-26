import { usePortal } from "@/lib/portal-context";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, User, FileText, Upload } from "lucide-react";

export default function PortalDashboard() {
  const { role, currentSpace } = usePortal();

  if (role === "accountant") {
    return (
      <PortalLayout>
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold">Welcome back</h2>
            <p className="text-muted-foreground">Manage all your clients from here</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  All Clients
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">View client list</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">Manage documents</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">View activity</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </PortalLayout>
    );
  }

  // Client view
  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold">
            Welcome, {currentSpace?.name}
          </h2>
          <p className="text-muted-foreground">
            {currentSpace?.type === "client" ? "Personal Account" : "Company Account"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Documents
              </CardTitle>
              <CardDescription>
                View and upload your documents
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Access your secure document vault
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Services
              </CardTitle>
              <CardDescription>
                View your active services
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Track your engagements and services
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PortalLayout>
  );
}
