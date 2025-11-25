import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth-context";

interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
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
  refreshOrganization: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType>({
  organization: null,
  role: null,
  loading: true,
  refreshOrganization: async () => {},
});

export const useOrganization = () => useContext(OrganizationContext);

export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [role, setRole] = useState<"owner" | "admin" | "staff" | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOrganization = async () => {
    if (!user) {
      setOrganization(null);
      setRole(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("organization_users")
        .select(`
          organization_id,
          role,
          organization:organizations(id, name, logo_url)
        `)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const orgUser = data as unknown as OrganizationUser;
        setOrganization(orgUser.organization);
        setRole(orgUser.role);
      } else {
        // User has no organization yet
        setOrganization(null);
        setRole(null);
      }
    } catch (error) {
      console.error("Error loading organization:", error);
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
        refreshOrganization: loadOrganization,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};
