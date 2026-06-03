import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { History, Loader2 } from "lucide-react";

interface OnboardingEvent {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_kind: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

const formatEventLabel = (e: OnboardingEvent): string => {
  if (e.event_type === "status_changed") {
    return `Status changed${e.from_status ? ` from ${e.from_status}` : ""}${e.to_status ? ` to ${e.to_status}` : ""}`;
  }
  return e.event_type.replace(/_/g, " ");
};

export default function OnboardingEventTimeline({ applicationId }: { applicationId: string }) {
  const [events, setEvents] = useState<OnboardingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("onboarding_events" as never)
        .select("id,event_type,from_status,to_status,actor_kind,metadata,created_at")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!cancelled && !error && data) setEvents(data as unknown as OnboardingEvent[]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <History className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading events…
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events recorded yet.</p>
        ) : (
          <ol className="relative border-l border-border pl-4 space-y-4">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{formatEventLabel(e)}</p>
                  <Badge variant="outline" className="text-[10px]">{e.actor_kind}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(e.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}