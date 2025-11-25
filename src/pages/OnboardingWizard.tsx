import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PracticeProfileStep } from "@/components/onboarding-wizard/PracticeProfileStep";
import { PracticeSetupStep } from "@/components/onboarding-wizard/PracticeSetupStep";
import { ComplianceSetupStep } from "@/components/onboarding-wizard/ComplianceSetupStep";
import { TeamSetupStep } from "@/components/onboarding-wizard/TeamSetupStep";
import { CRMSetupStep } from "@/components/onboarding-wizard/CRMSetupStep";
import { DataImportStep } from "@/components/onboarding-wizard/DataImportStep";

const STEPS = [
  { id: 1, name: "Practice Profile", description: "Logo, branding, and contact details" },
  { id: 2, name: "Practice Setup", description: "Timezone and service catalog" },
  { id: 3, name: "Compliance Setup", description: "HMRC and Companies House" },
  { id: 4, name: "Team Setup", description: "Invite your team members" },
  { id: 5, name: "CRM Setup", description: "Connect your CRM" },
  { id: 6, name: "Data Import", description: "Import existing data (optional)" },
];

const OnboardingWizard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { organization, loading: orgLoading, refreshOrganization } = useOrganization();
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [verifyingPayment, setVerifyingPayment] = useState(true);

  useEffect(() => {
    const verifySession = async () => {
      const sessionId = searchParams.get("session_id");
      const testMode = searchParams.get("test");
      
      // Allow test mode or no session (for testing purposes)
      if (testMode === "true" || !sessionId) {
        console.log("Test/development mode - bypassing payment verification");
        setVerifyingPayment(false);
        return;
      }

      // In a real implementation, you'd verify the Stripe session here
      // For now, we'll just proceed
      setVerifyingPayment(false);
    };

    verifySession();
  }, [searchParams, navigate, toast]);

  useEffect(() => {
    if (!orgLoading && organization?.onboarding_completed) {
      navigate("/");
    }
  }, [organization, orgLoading, navigate]);

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

  if (verifyingPayment || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Verifying your payment...</p>
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
