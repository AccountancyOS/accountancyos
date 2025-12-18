import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organization, loading: orgLoading } = useOrganization();

  useEffect(() => {
    if (authLoading || orgLoading) return;

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
    // Type assertion since billing_status is a new column
    const billingStatus = (organization as any).billing_status as string | undefined;
    if (billingStatus && billingStatus !== 'active') {
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
  }, [user, organization, authLoading, orgLoading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
};

export default Index;
