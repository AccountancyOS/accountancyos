import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardCheck, ArrowRight, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

type StatusKey =
  | "in_progress"
  | "engagement_pending"
  | "aml_pending"
  | "billing_pending"
  | "portal_pending"
  | "for_review"
  | "needs_client_action"
  | "approved"
  | "rejected";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  engagement_pending: "Engagement Pending",
  aml_pending: "AML Pending",
  billing_pending: "Billing Pending",
  portal_pending: "Portal Pending",
  for_review: "For Review",
  needs_client_action: "Needs Client Action",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const HIGHLIGHTED: StatusKey[] = [
  "for_review",
  "needs_client_action",
  "billing_pending",
  "aml_pending",
  "engagement_pending",
  "portal_pending",
];

export const OnboardingPipelineWidget = () => {
  const { organization } = useOrganization();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-pipeline", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return { counts: {}, forReview: [] as any[] };

      const [allRes, reviewRes] = await Promise.all([
        supabase
          .from("onboarding_applications")
          .select("id, status")
          .eq("organization_id", organization.id)
          .not("status", "in", "(approved,rejected,cancelled)"),
        supabase
          .from("onboarding_applications")
          .select(
            "id, status, first_name, last_name, company_name, email, application_type, submitted_for_review_at, updated_at"
          )
          .eq("organization_id", organization.id)
          .eq("status", "for_review")
          .order("submitted_for_review_at", { ascending: true })
          .limit(5),
      ]);

      const counts: Record<string, number> = {};
      for (const row of (allRes.data as any[]) || []) {
        counts[row.status] = (counts[row.status] || 0) + 1;
      }

      return { counts, forReview: (reviewRes.data as any[]) || [] };
    },
    enabled: !!organization?.id,
  });

  useRealtimeSubscription({
    table: "onboarding_applications",
    organizationId: organization?.id,
    queryKeys: [["onboarding-pipeline", organization?.id || ""]],
  });

  const counts = data?.counts || {};
  const forReview = data?.forReview || [];
  const reviewCount = counts["for_review"] || 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Onboarding Pipeline</CardTitle>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/onboarding")}>
          View All <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {HIGHLIGHTED.map((key) => {
                const value = counts[key] || 0;
                const isAlert = key === "for_review" && value > 0;
                return (
                  <div
                    key={key}
                    className={`rounded-md border p-3 ${
                      isAlert ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="text-2xl font-semibold">{value}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {STATUS_LABELS[key]}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Awaiting Review</h4>
                {reviewCount > 0 && (
                  <Badge variant="default">{reviewCount}</Badge>
                )}
              </div>
              {forReview.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No applications awaiting review.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {forReview.map((app: any) => {
                    const name =
                      app.company_name ||
                      [app.first_name, app.last_name].filter(Boolean).join(" ") ||
                      app.email ||
                      "Untitled Application";
                    const submitted = app.submitted_for_review_at || app.updated_at;
                    return (
                      <li key={app.id}>
                        <button
                          onClick={() => navigate(`/onboarding/${app.id}`)}
                          className="w-full flex items-center justify-between rounded-md px-2 py-2 text-left hover:bg-muted transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{name}</div>
                            <div className="text-xs text-muted-foreground">
                              Submitted{" "}
                              {submitted
                                ? formatDistanceToNow(new Date(submitted), {
                                    addSuffix: true,
                                  })
                                : "recently"}
                            </div>
                          </div>
                          <AlertCircle className="h-4 w-4 text-primary shrink-0 ml-2" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
