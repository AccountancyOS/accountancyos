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

    if (!user) {
      navigate("/auth");
      return;
    }

    if (!organization) {
      // CRITICAL FIX: User exists but has no organization - redirect to onboarding wizard
      // NOT back to /auth which would cause an infinite redirect loop
      navigate("/onboarding-wizard");
      return;
    }

    if (!organization.onboarding_completed) {
      navigate("/onboarding-wizard");
      return;
    }

    // Onboarding complete - show welcome dashboard
    navigate("/welcome");
  }, [user, organization, authLoading, orgLoading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
};

export default Index;