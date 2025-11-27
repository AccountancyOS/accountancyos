import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { format, isSameDay } from "date-fns";
import { useState } from "react";

type DeadlineFilters = {
  search: string;
  clientId: string;
  deadlineType: string;
  filingBody: string;
  status: string;
  riskLevel: string;
  ownerId: string;
  timeHorizon: string;
};

interface DeadlinesCalendarProps {
  filters: DeadlineFilters;
}

export const DeadlinesCalendar = ({ filters }: DeadlinesCalendarProps) => {
  const { organization } = useOrganization();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const { data: deadlines } = useQuery({
    queryKey: ["deadlines", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("deadlines")
        .select(`
          *,
          clients (first_name, last_name),
          companies (company_name)
        `)
        .eq("organization_id", organization.id)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const deadlinesOnSelectedDate = deadlines?.filter((d) =>
    selectedDate ? isSameDay(new Date(d.due_date), selectedDate) : false
  );

  const deadlineDates = deadlines?.map((d) => new Date(d.due_date)) || [];

  return (
    <div className="flex gap-6">
      <Card className="flex-1">
        <CardContent className="p-6">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            modifiers={{
              deadline: deadlineDates,
            }}
            modifiersClassNames={{
              deadline: "bg-primary/10 font-bold",
            }}
            className="rounded-md border"
          />
        </CardContent>
      </Card>

      <div className="w-96">
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">
              {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "Select a date"}
            </h3>
            {deadlinesOnSelectedDate && deadlinesOnSelectedDate.length > 0 ? (
              <div className="space-y-3">
                {deadlinesOnSelectedDate.map((deadline) => {
                  const clientName = deadline.clients
                    ? `${deadline.clients.first_name} ${deadline.clients.last_name}`
                    : deadline.companies?.company_name || "—";

                  return (
                    <div key={deadline.id} className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div className="font-medium">{deadline.name}</div>
                        <Badge variant="outline" className="capitalize text-xs">
                          {deadline.deadline_type}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">{clientName}</div>
                      {deadline.filing_body && (
                        <div className="text-xs text-muted-foreground mt-1">{deadline.filing_body}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No deadlines on this date</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
