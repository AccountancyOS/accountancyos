import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, isPast, isWithinInterval, addDays } from "date-fns";
import { Calendar, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ClientDeadlinesTabProps {
  clientId: string;
}

export function ClientDeadlinesTab({ clientId }: ClientDeadlinesTabProps) {
  const { organization } = useOrganization();

  const { data: deadlines, isLoading } = useQuery({
    queryKey: ["client-deadlines", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deadlines")
        .select("*")
        .eq("client_id", clientId)
        .order("due_date", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!clientId && !!organization?.id,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Deadlines</CardTitle>
          <CardDescription>Key statutory and service deadlines for this client</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
              <Skeleton className="h-10 w-10 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const warningThreshold = addDays(now, 14);

  const getDeadlineStatus = (dueDate: string, status: string) => {
    if (status === "completed") {
      return { icon: CheckCircle, variant: "default" as const, label: "Completed", color: "text-green-600" };
    }
    
    const due = new Date(dueDate);
    if (isPast(due)) {
      return { icon: AlertTriangle, variant: "destructive" as const, label: "Overdue", color: "text-destructive" };
    }
    if (isWithinInterval(due, { start: now, end: warningThreshold })) {
      return { icon: Clock, variant: "secondary" as const, label: "Due Soon", color: "text-amber-600" };
    }
    return { icon: Calendar, variant: "outline" as const, label: "Upcoming", color: "text-muted-foreground" };
  };

  const getDeadlineTypeBadge = (type: string) => {
    const typeLabels: Record<string, string> = {
      sa_submission: "SA Submission",
      sa_payment: "SA Payment",
      ct_accounts: "CT Accounts",
      ct_return: "CT Return",
      ct_payment: "CT Payment",
      vat_return: "VAT Return",
      confirmation_statement: "CS01",
      annual_accounts: "Annual Accounts",
      paye_payment: "PAYE Payment",
      cis_return: "CIS Return",
    };
    return typeLabels[type] || type;
  };

  // Separate upcoming and past deadlines
  const upcomingDeadlines = deadlines?.filter(d => d.status !== "completed" && !isPast(new Date(d.due_date))) || [];
  const overdueDeadlines = deadlines?.filter(d => d.status !== "completed" && isPast(new Date(d.due_date))) || [];
  const completedDeadlines = deadlines?.filter(d => d.status === "completed") || [];

  return (
    <div className="space-y-6">
      {/* Overdue Alert */}
      {overdueDeadlines.length > 0 && (
        <Card className="border-destructive">
          <CardHeader className="pb-3">
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Overdue Deadlines ({overdueDeadlines.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueDeadlines.map((deadline) => (
                <div
                  key={deadline.id}
                  className="flex items-center justify-between p-3 bg-destructive/10 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{deadline.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {getDeadlineTypeBadge(deadline.deadline_type)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-destructive font-medium">
                      {format(new Date(deadline.due_date), "d MMM yyyy")}
                    </p>
                    <Badge variant="destructive">Overdue</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Deadlines */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Deadlines</CardTitle>
          <CardDescription>Key statutory and service deadlines for this client</CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingDeadlines.length === 0 && overdueDeadlines.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No upcoming deadlines</p>
              <p className="text-sm mt-1">Deadlines will appear here when services are configured</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingDeadlines.map((deadline) => {
                const status = getDeadlineStatus(deadline.due_date, deadline.status);
                const StatusIcon = status.icon;

                return (
                  <div
                    key={deadline.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded flex items-center justify-center ${status.color} bg-muted`}>
                        <StatusIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">{deadline.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{getDeadlineTypeBadge(deadline.deadline_type)}</span>
                          {deadline.period_start && deadline.period_end && (
                            <>
                              <span>•</span>
                              <span>
                                {format(new Date(deadline.period_start), "MMM yy")} - {format(new Date(deadline.period_end), "MMM yy")}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-medium ${status.color}`}>
                        {format(new Date(deadline.due_date), "d MMM yyyy")}
                      </p>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Completed Deadlines */}
      {completedDeadlines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground">Completed ({completedDeadlines.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {completedDeadlines.slice(0, 5).map((deadline) => (
                <div
                  key={deadline.id}
                  className="flex items-center justify-between p-3 text-muted-foreground"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>{deadline.name}</span>
                  </div>
                  <span className="text-sm">
                    {format(new Date(deadline.due_date), "d MMM yyyy")}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
