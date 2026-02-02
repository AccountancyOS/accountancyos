import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Plus, FileText, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ClientServicesTabProps {
  clientId: string;
}

export function ClientServicesTab({ clientId }: ClientServicesTabProps) {
  const { organization } = useOrganization();

  const { data: engagements, isLoading } = useQuery({
    queryKey: ["client-engagements", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("engagements")
        .select(`
          *,
          services (
            id,
            name,
            code,
            category
          )
        `)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!clientId && !!organization?.id,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Services</CardTitle>
          <CardDescription>Services and engagements for this client</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
              <Skeleton className="h-10 w-10 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "cancelled":
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Active Services</CardTitle>
          <CardDescription>Services and engagements for this client</CardDescription>
        </div>
        <Button size="sm" disabled>
          <Plus className="h-4 w-4 mr-2" />
          Add Service
        </Button>
      </CardHeader>
      <CardContent>
        {!engagements || engagements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No services configured for this client</p>
            <p className="text-sm mt-1">Add a service to start tracking their engagements</p>
          </div>
        ) : (
          <div className="space-y-3">
            {engagements.map((engagement) => (
              <div
                key={engagement.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-primary/10 rounded flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {(engagement.services as any)?.name || "Unnamed Service"}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{(engagement.services as any)?.code || "-"}</span>
                      {engagement.start_date && (
                        <>
                          <span>•</span>
                          <span>
                            {format(new Date(engagement.start_date), "MMM yyyy")}
                            {engagement.end_date && ` - ${format(new Date(engagement.end_date), "MMM yyyy")}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {engagement.service_config && (engagement.service_config as any)?.fee && (
                    <span className="text-sm font-medium">
                      £{((engagement.service_config as any).fee || 0).toLocaleString()}
                      {engagement.frequency === "monthly" && "/mo"}
                    </span>
                  )}
                  {getStatusBadge(engagement.status || "active")}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
