import { CheckSquare, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
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
  const queryClient = useQueryClient();

  // FUN-5/Fix: portal clients could see tasks but not act on them, even though the client_tasks
  // portal UPDATE policy permits it. Let them mark a task complete.
  const complete = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("client_tasks")
        .update({ status: "complete" })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "tasks"] });
      toast.success("Task marked as done.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update the task."),
  });

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
            {data.map((t) => {
              const done = t.status === "complete";
              return (
                <div key={t.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">Due {formatDate(t.dueAt)}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={done ? "default" : "secondary"} className="capitalize">
                      {t.status.replace(/_/g, " ")}
                    </Badge>
                    {!done && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => complete.mutate(t.id)}
                        disabled={complete.isPending && complete.variables === t.id}
                      >
                        {complete.isPending && complete.variables === t.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Mark done"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
