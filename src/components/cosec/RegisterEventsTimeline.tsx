import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, UserPlus, UserMinus, Shield, TrendingUp, ArrowRight, RefreshCw, Building, AlertTriangle } from "lucide-react";
import { getRegisterEvents, formatEventType } from "@/lib/ch-sync-service";
import { format } from "date-fns";

interface RegisterEventsTimelineProps {
  companyId: string;
}

const eventIcons: Record<string, any> = {
  appointment: UserPlus,
  termination: UserMinus,
  resignation: UserMinus,
  psc_added: Shield,
  psc_ceased: Shield,
  psc_updated: Shield,
  allotment: TrendingUp,
  transfer: ArrowRight,
  share_class_created: TrendingUp,
  share_class_updated: TrendingUp,
  registered_office_changed: Building,
  sic_codes_changed: Building,
  confirmation_statement_filed: History,
  ch_sync: RefreshCw,
};

const eventColors: Record<string, string> = {
  appointment: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  termination: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  resignation: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  psc_added: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  psc_ceased: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  psc_updated: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  allotment: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  transfer: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  ch_sync: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

export function RegisterEventsTimeline({ companyId }: RegisterEventsTimelineProps) {
  const { data: events, isLoading } = useQuery({
    queryKey: ["register-events", companyId],
    queryFn: () => getRegisterEvents(companyId),
  });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading events...</div>;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-5 w-5" />
          Register Events Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No events recorded yet. Events will appear here as changes are made to the registers.
          </p>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {events.map((event, index) => {
                const IconComponent = eventIcons[event.event_type] || History;
                const colorClass = eventColors[event.event_type] || "bg-gray-100 text-gray-700";
                const profile: any = (event as any).created_by_profile;
                const actorName = profile
                  ? [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
                    profile.email ||
                    "System"
                  : "System";
                const discrepancies: any[] = Array.isArray(event.details?.discrepancies)
                  ? event.details.discrepancies
                  : [];

                return (
                  <div key={event.id} className="flex gap-4">
                    {/* Timeline line */}
                    <div className="flex flex-col items-center">
                      <div className={`p-2 rounded-full ${colorClass}`}>
                        <IconComponent className="h-4 w-4" />
                      </div>
                      {index < events.length - 1 && (
                        <div className="w-px h-full bg-border mt-2" />
                      )}
                    </div>
                    
                    {/* Event content */}
                    <div className="flex-1 pb-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-medium text-sm">
                            {formatEventType(event.event_type)}
                          </h4>
                          {event.person && (
                            <p className="text-sm text-muted-foreground">
                              {event.person.first_name} {event.person.last_name}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {event.created_at &&
                              format(new Date(event.created_at), "dd MMM yyyy · HH:mm")}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            by {actorName}
                          </p>
                        </div>
                      </div>
                      
                      {/* Event details */}
                      {event.details && Object.keys(event.details).length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                          {event.event_type === "allotment" && event.details.shares_allotted && (
                            <span>{Number(event.details.shares_allotted).toLocaleString()} shares allotted</span>
                          )}
                          {event.event_type === "transfer" && event.details.shares_transferred && (
                            <span>{Number(event.details.shares_transferred).toLocaleString()} shares transferred</span>
                          )}
                          {event.event_type === "ch_sync" && (
                            <span>
                              {event.details.officers_count} officers, {event.details.pscs_count} PSCs synced
                              {event.details.discrepancies_found > 0 && (
                                <span className="text-amber-600"> ({event.details.discrepancies_found} discrepancies)</span>
                              )}
                            </span>
                          )}
                          {(event.event_type === "appointment" || event.event_type === "resignation") && event.details.role && (
                            <span>Role: {event.details.role}</span>
                          )}
                          {event.event_type.startsWith("psc") && event.details.nature_of_control && (
                            <span>{event.details.nature_of_control.length} control types</span>
                          )}
                        </div>
                      )}

                      {/* Discrepancy detail (ch_sync) */}
                      {event.event_type === "ch_sync" && discrepancies.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {discrepancies.slice(0, 5).map((d: any, i: number) => (
                            <li
                              key={i}
                              className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2"
                            >
                              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span>{d.message}</span>
                            </li>
                          ))}
                          {discrepancies.length > 5 && (
                            <li className="text-xs text-muted-foreground pl-5">
                              +{discrepancies.length - 5} more
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
