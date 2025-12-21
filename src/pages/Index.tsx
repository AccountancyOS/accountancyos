import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/lib/app-context";
import { Loader2 } from "lucide-react";

const STRIPE_RETURN_GUARD_TTL = 2 * 60 * 1000; // 2 minutes

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

    // Priority 2: No organization → complete payment (they need to finish signup)
    if (!organization) {
      navigate("/complete-payment");
      return;
    }

    // Priority 3: Check billing status - must be active to proceed
    const billingStatus = organization.billing_status;
    
    // Check for recent Stripe return - if so, let onboarding-wizard handle polling
    const stripeReturnTs = localStorage.getItem("stripe_return_ts");
    if (stripeReturnTs) {
      const returnAge = Date.now() - parseInt(stripeReturnTs, 10);
      if (returnAge < STRIPE_RETURN_GUARD_TTL) {
        // Recent Stripe return - let onboarding-wizard handle verification
        console.log("[Index] Recent Stripe return detected, routing to onboarding-wizard for verification");
        navigate("/onboarding-wizard");
        return;
      } else {
        // Stale guard - clean it up
        localStorage.removeItem("stripe_return_ts");
        localStorage.removeItem("stripe_return_session_id");
      }
    }
    
    // Standard billing check
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