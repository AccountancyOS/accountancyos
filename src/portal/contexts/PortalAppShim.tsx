import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppContext, type AppContextType, type AppRole, type Organization } from "@/lib/app-context";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { usePortalEntity } from "./PortalEntityContext";

/**
 * Provides a minimal AppContext implementation suitable for portal users so
 * we can reuse accountant-side components (which call `useApp` / `useOrganization`)
 * inside the portal. The shim hydrates only the fields those components actually
 * read: `organization.id`, `user`, `session`, `role`.
 *
 * Portal users are intentionally given role "viewer" — RLS is the real
 * gatekeeper for writes; the role is informational only.
 */
export function PortalAppShim({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { ctx } = usePortalEntity();
  const [user, setUser] = useState<AppContextType["user"]>(null);
  const [session, setSession] = useState<AppContextType["session"]>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AppContextType>(() => {
    const organization: Organization | null = ctx.organizationId
      ? {
          id: ctx.organizationId,
          name: "",
          logo_url: null,
          onboarding_completed: true,
          setup_dismissed: true,
          timezone: null,
          email_domain: null,
          billing_status: "active" as Organization["billing_status"],
          stripe_customer_id: null,
          stripe_subscription_id: null,
        }
      : null;

    return {
      user,
      session,
      loading: false,
      organization,
      role: "viewer" as AppRole,
      organizationLoading: false,
      organizationError: null,
      subscribed: true,
      subscriptionEnd: null,
      checkingSubscription: false,
      signOut: async () => {
        await supabase.auth.signOut();
        navigate("/portal/login", { replace: true });
      },
      refreshOrganization: async () => {},
      checkSubscription: async () => {},
    };
  }, [ctx.organizationId, user, session, navigate]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}