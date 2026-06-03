import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, PlayCircle } from "lucide-react";
import { useOrganization } from "@/lib/organization-context";
import {
  validateOnboardingFlow,
  validateOnboardingLifecycle,
  type FlowValidationResult,
} from "@/lib/e2e-flow-validation";

const OnboardingDiagnostics = () => {
  const { organization } = useOrganization();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<FlowValidationResult[]>([]);

  const handleRun = async () => {
    if (!organization?.id) return;
    setRunning(true);
    setResults([]);
    try {
      const out: FlowValidationResult[] = [];
      out.push(await validateOnboardingFlow(organization.id));
      out.push(await validateOnboardingLifecycle(organization.id));
      setResults(out);
    } finally {
      setRunning(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">
              Onboarding Diagnostics
            </h1>
            <p className="text-muted-foreground mt-1">
              Validate the end-to-end onboarding lifecycle across schema,
              audit log, RPCs, and edge functions.
            </p>
          </div>
          <Button onClick={handleRun} disabled={running || !organization?.id}>
            {running ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-2" /> Run Validation
              </>
            )}
          </Button>
        </div>

        {results.length === 0 && !running && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Click "Run Validation" to verify Phases 1-5 of the onboarding
              workflow.
            </CardContent>
          </Card>
        )}

        {results.map((result) => (
          <Card key={result.flowName}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                {result.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                <CardTitle className="text-base">{result.flowName}</CardTitle>
              </div>
              <Badge variant={result.success ? "default" : "destructive"}>
                {result.steps.filter((s) => s.success).length}/
                {result.steps.length} passed
              </Badge>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {result.steps.map((step, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm border-b border-border/50 pb-2 last:border-0"
                  >
                    {step.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{step.step}</div>
                      {step.data && (
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          {JSON.stringify(step.data)}
                        </div>
                      )}
                      {step.error && (
                        <div className="text-xs text-destructive mt-0.5">
                          {step.error}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {step.duration}ms
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
};

export default OnboardingDiagnostics;