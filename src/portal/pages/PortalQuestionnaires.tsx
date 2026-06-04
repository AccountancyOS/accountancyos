import { ClipboardList, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";
import { usePortalQuestionnaires } from "../hooks/usePortalData";

export default function PortalQuestionnaires() {
  const { data, isLoading } = usePortalQuestionnaires();

  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader
        title="Questionnaires"
        description="Information requests from your accountant."
      />
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <PortalEmptyState
          icon={ClipboardList}
          title="No Questionnaires"
          description="When your accountant sends you a questionnaire, it will appear here."
        />
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {data.map((q) => (
              <div key={q.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">{q.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 capitalize">
                    Status: {q.status}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {q.status}
                  </Badge>
                  {q.responseUrl ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(q.responseUrl!, "_blank", "noopener")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}