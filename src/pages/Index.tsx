import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/lib/app-context";
import { Loader2 } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const { user, organization, loading, organizationLoading } = useApp();

  useEffect(() => {
    if (loading || organizationLoading) return;

    // Priority 1: Not logged in → auth
    if (!user) {
      navigate("/auth");
      return;
    }

    // Priority 2: No organization → onboarding wizard (will handle org creation)
    if (!organization) {
      navigate("/onboarding-wizard");
      return;
    }

    // Priority 3: Check billing status - must be active to proceed
    // Treat null/undefined/any non-active status as needing payment
    const billingStatus = organization.billing_status;
    if (billingStatus !== 'active') {
      navigate("/complete-payment");
      return;
    }

    // Priority 4: Onboarding not completed → wizard
    if (!organization.onboarding_completed) {
      navigate("/onboarding-wizard");
      return;
    }

    // Priority 5: All good → welcome dashboard
    navigate("/welcome");
  }, [user, organization, loading, organizationLoading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
};

export default Index;
