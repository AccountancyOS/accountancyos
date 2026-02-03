import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { 
  format, 
  isSameDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  isWithinInterval,
  eachDayOfInterval
} from "date-fns";
import { useState, useMemo } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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

type ViewMode = "day" | "week" | "month";

const weekOptions = { weekStartsOn: 1 as const }; // Monday start (UK standard)

export const DeadlinesCalendar = ({ filters }: DeadlinesCalendarProps) => {
  const { organization } = useOrganization();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("day");

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

  // Calculate date range based on view mode
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (!selectedDate) {
      return { rangeStart: new Date(), rangeEnd: new Date() };
    }
    
    switch (viewMode) {
      case "week":
        return {
          rangeStart: startOfWeek(selectedDate, weekOptions),
          rangeEnd: endOfWeek(selectedDate, weekOptions),
        };
      case "month":
        return {
          rangeStart: startOfMonth(selectedDate),
          rangeEnd: endOfMonth(selectedDate),
        };
      case "day":
      default:
        return {
          rangeStart: selectedDate,
          rangeEnd: selectedDate,
        };
    }
  }, [selectedDate, viewMode]);

  // Filter deadlines within the date range
  const deadlinesInRange = useMemo(() => {
    if (!deadlines || !selectedDate) return [];
    
    if (viewMode === "day") {
      return deadlines.filter((d) => isSameDay(new Date(d.due_date), selectedDate));
    }
    
    return deadlines.filter((d) => {
      const dueDate = new Date(d.due_date);
      return isWithinInterval(dueDate, { start: rangeStart, end: rangeEnd });
    });
  }, [deadlines, selectedDate, viewMode, rangeStart, rangeEnd]);

  // Group deadlines by day for week/month views
  const groupedDeadlines = useMemo(() => {
    if (viewMode === "day") return null;
    
    const groups: Record<string, typeof deadlinesInRange> = {};
    
    deadlinesInRange.forEach((deadline) => {
      const dateKey = format(new Date(deadline.due_date), "yyyy-MM-dd");
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(deadline);
    });
    
    // Sort by date
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [deadlinesInRange, viewMode]);

  const deadlineDates = deadlines?.map((d) => new Date(d.due_date)) || [];

  // Get days in the current range for highlighting
  const daysInRange = useMemo(() => {
    if (viewMode === "day" || !selectedDate) return [];
    return eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  }, [viewMode, selectedDate, rangeStart, rangeEnd]);

  // Header text based on view mode
  const headerText = useMemo(() => {
    if (!selectedDate) return "Select a date";
    
    switch (viewMode) {
      case "week":
        return `Week of ${format(rangeStart, "d MMMM yyyy")}`;
      case "month":
        return format(selectedDate, "MMMM yyyy");
      case "day":
      default:
        return format(selectedDate, "d MMMM yyyy");
    }
  }, [selectedDate, viewMode, rangeStart]);

  const emptyMessage = useMemo(() => {
    switch (viewMode) {
      case "week":
        return "No deadlines this week";
      case "month":
        return "No deadlines this month";
      case "day":
      default:
        return "No deadlines on this date";
    }
  }, [viewMode]);

  const renderDeadlineCard = (deadline: (typeof deadlinesInRange)[0]) => {
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
  };

  return (
    <div className="flex flex-col gap-4">
      {/* View Mode Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">View:</span>
        <ToggleGroup 
          type="single" 
          value={viewMode} 
          onValueChange={(value) => value && setViewMode(value as ViewMode)}
          size="sm"
        >
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
          <ToggleGroupItem value="month">Month</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex gap-6">
        <Card className="flex-1">
          <CardContent className="p-6">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              weekStartsOn={1}
              modifiers={{
                deadline: deadlineDates,
                inRange: daysInRange,
              }}
              modifiersClassNames={{
                deadline: "bg-primary/10 font-bold",
                inRange: viewMode !== "day" ? "bg-accent/50" : "",
              }}
              className="rounded-md border pointer-events-auto"
            />
          </CardContent>
        </Card>

        <div className="w-96">
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">{headerText}</h3>
              
              {deadlinesInRange.length > 0 ? (
                <div className="space-y-4">
                  {viewMode === "day" ? (
                    // Day view: simple list
                    <div className="space-y-3">
                      {deadlinesInRange.map(renderDeadlineCard)}
                    </div>
                  ) : (
                    // Week/Month view: grouped by day
                    <>
                      {groupedDeadlines?.map(([dateKey, dayDeadlines]) => (
                        <div key={dateKey} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-muted-foreground">
                              {format(new Date(dateKey), "EEEE d MMM")}
                            </h4>
                            <Badge variant="secondary" className="text-xs">
                              {dayDeadlines.length}
                            </Badge>
                          </div>
                          <div className="space-y-2 pl-2 border-l-2 border-muted">
                            {dayDeadlines.map(renderDeadlineCard)}
                          </div>
                        </div>
                      ))}
                      <div className="pt-2 border-t text-sm text-muted-foreground">
                        Total: {deadlinesInRange.length} deadline{deadlinesInRange.length !== 1 ? "s" : ""} this {viewMode}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">{emptyMessage}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
