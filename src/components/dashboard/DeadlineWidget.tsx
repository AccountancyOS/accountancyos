import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, ArrowRight } from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { Link } from "react-router-dom";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

export const DeadlineWidget = () => {
  const { organization } = useOrganization();

  const { data: deadlines, isLoading } = useQuery({
    queryKey: ["upcoming-deadlines", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 14);

      const { data, error } = await supabase
        .from("deadlines")
        .select(`
          id,
          name,
          due_date,
          deadline_type,
          filing_body,
          status,
          clients (first_name, last_name),
          companies (company_name)
        `)
        .eq("organization_id", organization.id)
        .in("status", ["pending", "at_risk"])
        .lte("due_date", futureDate.toISOString())
        .order("due_date", { ascending: true })
        .limit(8);

      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  // Real-time subscription for deadlines
  useRealtimeSubscription({
    table: "deadlines",
    organizationId: organization?.id,
    queryKeys: [["upcoming-deadlines", organization?.id || ""]],
  });

  const getRiskColor = (dueDate: string) => {
    const due = new Date(dueDate);
    const daysRemaining = differenceInDays(due, new Date());

    if (isPast(due)) return "bg-destructive text-destructive-foreground";
    if (daysRemaining <= 3) return "bg-destructive/80 text-destructive-foreground";
    if (daysRemaining <= 7) return "bg-amber-500 text-white";
    return "bg-green-500 text-white";
  };

  const getFilingBodyBadge = (filingBody: string) => {
    switch (filingBody) {
      case "HMRC":
        return <Badge variant="outline" className="text-xs">HMRC</Badge>;
      case "COMPANIES_HOUSE":
        return <Badge variant="outline" className="text-xs">CH</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{filingBody}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Upcoming Deadlines
          </CardTitle>
          <CardDescription>Next 14 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Upcoming Deadlines
          </CardTitle>
          <CardDescription>Next 14 days</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/deadlines">
            View All <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[280px]">
          {deadlines && deadlines.length > 0 ? (
            <div className="space-y-3">
              {deadlines.map((deadline) => {
                const entityName = deadline.companies?.company_name || 
                  (deadline.clients ? `${deadline.clients.first_name} ${deadline.clients.last_name}` : "Unknown");
                
                return (
                  <div key={deadline.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{deadline.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground truncate">{entityName}</span>
                        {getFilingBodyBadge(deadline.filing_body)}
                      </div>
                    </div>
                    <Badge className={`ml-2 ${getRiskColor(deadline.due_date)}`}>
                      {format(new Date(deadline.due_date), "d MMM")}
                    </Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Calendar className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No upcoming deadlines</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
