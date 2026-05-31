import { useState, useEffect, useCallback } from "react";
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

const POLLING_MAX_ATTEMPTS = 10;
const POLLING_INTERVAL_MS = 1000;
const STRIPE_RETURN_GUARD_TTL = 2 * 60 * 1000; // 2 minutes

type VerificationStatus = 'idle' | 'polling' | 'success' | 'timeout' | 'error';

const OnboardingWizard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { organization, loading: orgLoading, refreshOrganization } = useOrganization();
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('idle');
  const [pollAttempts, setPollAttempts] = useState(0);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Check if billing status is valid (active or trialing treated as active by webhook)
  const isBillingActive = useCallback(() => {
    return organization?.billing_status === 'active';
  }, [organization?.billing_status]);

  // Option A+ polling: poll for billing status to become active
  const pollForBillingStatus = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < POLLING_MAX_ATTEMPTS; attempt++) {
      setPollAttempts(attempt + 1);
      
      await refreshOrganization();
      
      // Check if billing is now active
      // Note: We need to check the fresh data, so we'll return and let the effect re-run
      // Actually, we need to get fresh org data after refresh
      const { data: freshOrg } = await supabase
        .from('organizations')
        .select('billing_status')
        .eq('id', organization?.id || '')
        .maybeSingle();
      
      if (freshOrg?.billing_status === 'active') {
        return true;
      }
      
      // Wait before next attempt
      if (attempt < POLLING_MAX_ATTEMPTS - 1) {
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
      }
    }
    return false;
  }, [refreshOrganization, organization?.id]);

  // Main verification effect - runs on mount
  useEffect(() => {
    const verifySession = async () => {
      const sessionId = searchParams.get("session_id");
      
      // Set localStorage guard if returning from Stripe
      if (sessionId) {
        localStorage.setItem("stripe_return_ts", Date.now().toString());
        localStorage.setItem("stripe_return_session_id", sessionId);
        console.log("[OnboardingWizard] Set Stripe return guard", { sessionId });
      }
      
      // Refresh org to get latest status
      await refreshOrganization();
      
      // Check if already active
      if (isBillingActive()) {
        setVerificationStatus('success');
        return;
      }
      
      // Case A: Returning from Stripe with session_id - poll for webhook to complete
      if (sessionId) {
        console.log("[OnboardingWizard] Returning from Stripe, starting Option A+ polling");
        setVerificationStatus('polling');
        
        const success = await pollForBillingStatus();
        
        if (success) {
          setVerificationStatus('success');
          // Clear localStorage guard on success
          localStorage.removeItem("stripe_return_ts");
          localStorage.removeItem("stripe_return_session_id");
          localStorage.removeItem("pending_org_id");
          // Post-payment landing: send to Overview where the practice
          // onboarding checklist lives, not the standalone 6-step wizard.
          navigate(organization?.onboarding_completed ? '/welcome' : '/overview', { replace: true });
          return;
        } else {
          // Polling exhausted - redirect to complete-payment with friendly message
          setVerificationStatus('timeout');
          console.log("[OnboardingWizard] Polling timed out, redirecting to complete-payment");
          navigate('/complete-payment?reason=verification_pending');
        }
        return;
      }
      
      // Case B: No session_id - check if we have a recent Stripe return guard
      const stripeReturnTs = localStorage.getItem("stripe_return_ts");
      if (stripeReturnTs) {
        const returnAge = Date.now() - parseInt(stripeReturnTs, 10);
        if (returnAge < STRIPE_RETURN_GUARD_TTL) {
          // Recent Stripe return - poll for status
          console.log("[OnboardingWizard] Recent Stripe return detected, polling");
          setVerificationStatus('polling');
          
          const success = await pollForBillingStatus();
          
          if (success) {
            setVerificationStatus('success');
            localStorage.removeItem("stripe_return_ts");
            localStorage.removeItem("stripe_return_session_id");
            localStorage.removeItem("pending_org_id");
            navigate(organization?.onboarding_completed ? '/welcome' : '/overview', { replace: true });
            return;
          } else {
            setVerificationStatus('timeout');
            navigate('/complete-payment?reason=verification_pending');
          }
          return;
        }
      }
      
      // Case C: No session_id and no recent return - if not active, redirect silently
      if (!isBillingActive()) {
        console.log("[OnboardingWizard] No session and billing not active, redirecting to complete-payment");
        navigate('/complete-payment');
        return;
      }
      
      setVerificationStatus('success');
    };

    verifySession();
  }, [searchParams, refreshOrganization, isBillingActive, pollForBillingStatus, navigate]);

  // Redirect if onboarding already completed
  useEffect(() => {
    if (!orgLoading && organization?.onboarding_completed && verificationStatus === 'success') {
      navigate("/");
    }
  }, [organization, orgLoading, navigate, verificationStatus]);

  const handleRetry = async () => {
    setVerificationStatus('polling');
    setPollAttempts(0);
    
    const success = await pollForBillingStatus();
    
    if (success) {
      setVerificationStatus('success');
      localStorage.removeItem("stripe_return_ts");
      localStorage.removeItem("stripe_return_session_id");
    } else {
      setVerificationStatus('timeout');
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
        title: "Setup complete",
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

  // Polling/Verifying state - show friendly waiting UI
  if (verificationStatus === 'polling' || verificationStatus === 'idle') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-lg font-medium">Confirming your subscription...</p>
          {pollAttempts > 0 && (
            <p className="text-sm text-muted-foreground">
              Checking... ({pollAttempts}/{POLLING_MAX_ATTEMPTS})
            </p>
          )}
        </div>
      </div>
    );
  }

  // Timeout state - show friendly message with retry option
  if (verificationStatus === 'timeout') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="bg-amber-100 p-4 rounded-full">
                <AlertCircle className="h-12 w-12 text-amber-500" />
              </div>
            </div>
            <CardTitle className="text-xl">Payment still processing</CardTitle>
            <CardDescription>
              Your payment is being processed. This usually takes a few seconds, but occasionally takes longer.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Button
              onClick={handleRetry}
              className="w-full"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Check again
            </Button>

            <Button
              onClick={() => navigate('/complete-payment')}
              variant="outline"
              className="w-full"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Return to payment
            </Button>

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
                  <p>Billing Status: {organization?.billing_status || 'Not set'}</p>
                  <p>Poll Attempts: {pollAttempts}</p>
                  <p>Session ID: {searchParams.get("session_id") || 'None'}</p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state (org still loading after verification success)
  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading your account...</p>
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