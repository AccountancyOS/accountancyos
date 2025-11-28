import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth-context";
import { useToast } from "@/hooks/use-toast";

interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
  onboarding_completed: boolean;
  timezone: string | null;
  email_domain: string | null;
}

interface OrganizationUser {
  organization_id: string;
  role: "owner" | "admin" | "staff";
  organization: Organization;
}

interface OrganizationContextType {
  organization: Organization | null;
  role: "owner" | "admin" | "staff" | null;
  loading: boolean;
  error: string | null;
  refreshOrganization: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType>({
  organization: null,
  role: null,
  loading: true,
  error: null,
  refreshOrganization: async () => {},
});

export const useOrganization = () => useContext(OrganizationContext);

export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [role, setRole] = useState<"owner" | "admin" | "staff" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrganization = async () => {
    if (!user) {
      setOrganization(null);
      setRole(null);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setError(null);
      const { data, error: queryError } = await supabase
        .from("organization_users")
        .select(`
          organization_id,
          role,
          organization:organizations(id, name, logo_url, onboarding_completed, timezone, email_domain)
        `)
        .eq("user_id", user.id)
        .maybeSingle();

      if (queryError) {
        console.error("Error loading organization:", queryError);
        setError("Failed to load organization data");
        toast({
          title: "Error loading organization",
          description: "Please try refreshing the page. If the problem persists, contact support.",
          variant: "destructive",
        });
        throw queryError;
      }

      if (data) {
        const orgUser = data as unknown as OrganizationUser;
        setOrganization(orgUser.organization);
        setRole(orgUser.role);
      } else {
        // User has no organization yet - this is not an error, just means they need to complete signup
        setOrganization(null);
        setRole(null);
      }
    } catch (err) {
      console.error("Error loading organization:", err);
      setOrganization(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrganization();
  }, [user]);

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        role,
        loading,
        error,
        refreshOrganization: loadOrganization,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};