import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Loader2, AlertCircle, RefreshCw, ArrowLeft, CreditCard, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PracticeProfileStep } from "@/components/onboarding-wizard/PracticeProfileStep";
import { PracticeSetupStep } from "@/components/onboarding-wizard/PracticeSetupStep";
import { ComplianceSetupStep } from "@/components/onboarding-wizard/ComplianceSetupStep";
import { TeamSetupStep } from "@/components/onboarding-wizard/TeamSetupStep";
import { CRMSetupStep } from "@/components/onboarding-wizard/CRMSetupStep";
import { DataImportStep } from "@/components/onboarding-wizard/DataImportStep";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const STEPS = [
  { id: 1, name: "Practice Profile", description: "Logo, branding, and contact details" },
  { id: 2, name: "Practice Setup", description: "Timezone and service catalog" },
  { id: 3, name: "Compliance Setup", description: "HMRC and Companies House" },
  { id: 4, name: "Team Setup", description: "Invite your team members" },
  { id: 5, name: "CRM Setup", description: "Connect your CRM" },
  { id: 6, name: "Data Import", description: "Import existing data (optional)" },
];

const LOAD_TIMEOUT_MS = 15000; // 15 seconds

const OnboardingWizard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { organization, loading: orgLoading, refreshOrganization } = useOrganization();
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [verifyingPayment, setVerifyingPayment] = useState(true);
  const [loadTimeout, setLoadTimeout] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Timeout detection
  useEffect(() => {
    if (!verifyingPayment && !orgLoading) return;

    const timer = setTimeout(() => {
      if (verifyingPayment || orgLoading) {
        setLoadTimeout(true);
      }
    }, LOAD_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [verifyingPayment, orgLoading]);

  useEffect(() => {
    const verifySession = async () => {
      try {
        const sessionId = searchParams.get("session_id");
        
        // No session_id means user arrived without completing Stripe checkout
        // They should go to /complete-payment instead
        if (!sessionId) {
          console.log("No session_id - redirecting to complete payment");
          setLoadError("Payment verification required. Please complete payment to continue.");
          setVerifyingPayment(false);
          return;
        }

        // Refresh organization to get latest billing status
        await refreshOrganization();
        setVerifyingPayment(false);
      } catch (error: any) {
        console.error("Payment verification error:", error);
        setLoadError(error.message || "Failed to verify payment");
        setVerifyingPayment(false);
      }
    };

    verifySession();
  }, [searchParams, refreshOrganization]);

  useEffect(() => {
    if (!orgLoading && organization?.onboarding_completed) {
      navigate("/");
    }
  }, [organization, orgLoading, navigate]);

  const handleRetry = async () => {
    setRetrying(true);
    setLoadTimeout(false);
    setLoadError(null);
    
    try {
      await refreshOrganization();
      setVerifyingPayment(false);
    } catch (error: any) {
      setLoadError(error.message || "Failed to load organization");
    } finally {
      setRetrying(false);
    }
  };

  const handleStepComplete = (stepId: number) => {
    if (!completedSteps.includes(stepId)) {
      setCompletedSteps([...completedSteps, stepId]);
    }
    
    if (stepId < STEPS.length) {
      setCurrentStep(stepId + 1);
    }
  };

  const handleSkipStep = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleFinish = async () => {
    try {
      if (!organization?.id) return;

      const { error } = await supabase
        .from("organizations")
        .update({ onboarding_completed: true })
        .eq("id", organization.id);

      if (error) throw error;

      await refreshOrganization();

      toast({
        title: "Setup complete!",
        description: "Welcome to AccountancyOS. Let's get started.",
      });

      navigate("/");
    } catch (error: any) {
      toast({
        title: "Error completing setup",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Show error/timeout state
  if (loadTimeout || loadError) {
    const billingStatus = (organization as any)?.billing_status;
    const needsPayment = !billingStatus || billingStatus !== 'active';

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="bg-destructive/10 p-4 rounded-full">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-xl">
              {loadError ? "Something went wrong" : "Loading taking too long"}
            </CardTitle>
            <CardDescription>
              {loadError || "We're having trouble loading your account. This might be a temporary issue."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Button
              onClick={handleRetry}
              className="w-full"
              disabled={retrying}
            >
              {retrying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try Again
                </>
              )}
            </Button>

            {needsPayment && (
              <Button
                onClick={() => navigate('/complete-payment')}
                variant="outline"
                className="w-full"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Go to Complete Payment
              </Button>
            )}

            <Button
              onClick={() => navigate('/auth')}
              variant="ghost"
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sign In
            </Button>

            {/* Diagnostics panel */}
            <Collapsible open={showDiagnostics} onOpenChange={setShowDiagnostics}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full text-muted-foreground">
                  {showDiagnostics ? (
                    <>
                      <ChevronUp className="mr-2 h-4 w-4" />
                      Hide Diagnostics
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-2 h-4 w-4" />
                      Show Diagnostics
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 p-3 bg-muted rounded-lg text-xs font-mono space-y-1">
                  <p>Organization ID: {organization?.id || 'Not loaded'}</p>
                  <p>Organization: {organization?.name || 'Not loaded'}</p>
                  <p>Billing Status: {billingStatus || 'Not set'}</p>
                  <p>Onboarding: {organization?.onboarding_completed ? 'Complete' : 'Incomplete'}</p>
                  <p>Org Loading: {orgLoading ? 'Yes' : 'No'}</p>
                  <p>Payment Verifying: {verifyingPayment ? 'Yes' : 'No'}</p>
                  {loadError && <p className="text-destructive">Error: {loadError}</p>}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (verifyingPayment || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">
            {verifyingPayment ? "Verifying your payment..." : "Loading your account..."}
          </p>
        </div>
      </div>
    );
  }

  const progress = (completedSteps.length / STEPS.length) * 100;
  const isLastStep = currentStep === STEPS.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-accent/20 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Welcome to AccountancyOS</h1>
          <p className="text-muted-foreground">
            Let's get your practice set up in just a few steps
          </p>
        </div>

        {/* Progress */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex justify-between text-sm text-muted-foreground mb-2">
                <span>Step {currentStep} of {STEPS.length}</span>
                <span>{Math.round(progress)}% complete</span>
              </div>
              <Progress value={progress} className="h-2" />
              
              {/* Steps indicator */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 pt-4">
                {STEPS.map((step) => (
                  <div
                    key={step.id}
                    className={`text-center p-2 rounded-lg transition-colors ${
                      completedSteps.includes(step.id)
                        ? "bg-primary/10 text-primary"
                        : step.id === currentStep
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-center mb-1">
                      {completedSteps.includes(step.id) ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <span className="text-xs font-semibold">{step.id}</span>
                      )}
                    </div>
                    <p className="text-xs font-medium hidden md:block">{step.name}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Step Content */}
        <Card>
          <CardHeader>
            <CardTitle>{STEPS[currentStep - 1].name}</CardTitle>
            <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
          </CardHeader>
          <CardContent>
            {currentStep === 1 && (
              <PracticeProfileStep
                organizationId={organization?.id || ""}
                onComplete={() => handleStepComplete(1)}
                onSkip={handleSkipStep}
              />
            )}
            {currentStep === 2 && (
              <PracticeSetupStep
                organizationId={organization?.id || ""}
                onComplete={() => handleStepComplete(2)}
                onSkip={handleSkipStep}
              />
            )}
            {currentStep === 3 && (
              <ComplianceSetupStep
                organizationId={organization?.id || ""}
                onComplete={() => handleStepComplete(3)}
                onSkip={handleSkipStep}
              />
            )}
            {currentStep === 4 && (
              <TeamSetupStep
                organizationId={organization?.id || ""}
                onComplete={() => handleStepComplete(4)}
                onSkip={handleSkipStep}
              />
            )}
            {currentStep === 5 && (
              <CRMSetupStep
                organizationId={organization?.id || ""}
                onComplete={() => handleStepComplete(5)}
                onSkip={handleSkipStep}
              />
            )}
            {currentStep === 6 && (
              <DataImportStep
                organizationId={organization?.id || ""}
                onComplete={handleFinish}
                onSkip={handleFinish}
              />
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
          >
            Back
          </Button>
          <Button onClick={isLastStep ? handleFinish : handleSkipStep} variant="ghost">
            {isLastStep ? "Finish Setup" : "Skip for Now"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
