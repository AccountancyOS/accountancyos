import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";

/**
 * Phase 1 placeholder for the client onboarding wizard.
 * Phase 2 will replace this with the full Engagement Letter / AML / Billing / Portal flow.
 */
export default function PublicOnboarding() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const [loading, setLoading] = useState(true);
  const [practiceName, setPracticeName] = useState<string>("your accountant");

  useEffect(() => {
    if (!applicationId) return;
    (async () => {
      const { data } = await supabase
        .from("onboarding_applications")
        .select("organization_id, organizations(name)")
        .eq("id", applicationId)
        .maybeSingle();
      const name = (data as unknown as { organizations?: { name?: string } })?.organizations?.name;
      if (name) setPracticeName(name);
      setLoading(false);
    })();
  }, [applicationId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-6">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <div className="flex items-center gap-3 text-emerald-700">
            <CheckCircle2 className="h-6 w-6" />
            <CardTitle>Proposal Accepted</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Thank you for accepting your proposal from <strong>{practiceName}</strong>.
          </p>
          <p>
            Your onboarding has been started. The next steps — signing your engagement letter,
            uploading AML documents, setting up billing and creating your portal account — will
            appear here shortly.
          </p>
          <p>
            {practiceName} has been notified and will be in touch.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
