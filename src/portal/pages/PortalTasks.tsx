import { CheckSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";
import { usePortalTasks } from "../hooks/usePortalData";

function formatDate(d?: string | null) {
  if (!d) return "No Due Date";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function PortalTasks() {
  const { data, isLoading } = usePortalTasks();

  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader title="Tasks" description="Items requiring your attention." />
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <PortalEmptyState
          icon={CheckSquare}
          title="No Tasks Assigned"
          description="You will see tasks here when your accountant assigns work that requires your input."
        />
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {data.map((t) => (
              <div key={t.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Due {formatDate(t.dueAt)}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 capitalize">
                  {t.status.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}