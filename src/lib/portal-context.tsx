import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface PortalSpace {
  id: string;
  type: "client" | "company";
  name: string;
  client_id?: string;
  company_id?: string;
}

interface PortalContextType {
  user: User | null;
  role: "accountant" | "client" | null;
  organizationId: string | null;
  spaces: PortalSpace[];
  currentSpace: PortalSpace | null;
  loading: boolean;
  switchSpace: (space: PortalSpace) => void;
  signOut: () => Promise<void>;
}

const PortalContext = createContext<PortalContextType>({
  user: null,
  role: null,
  organizationId: null,
  spaces: [],
  currentSpace: null,
  loading: true,
  switchSpace: () => {},
  signOut: async () => {},
});

export const usePortal = () => useContext(PortalContext);

export const PortalProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<"accountant" | "client" | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<PortalSpace[]>([]);
  const [currentSpace, setCurrentSpace] = useState<PortalSpace | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPortalData = async (userId: string) => {
    try {
      // Get user role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role, organization_id")
        .eq("user_id", userId)
        .single();

      if (!roleData) {
        setLoading(false);
        return;
      }

      setRole(roleData.role as "accountant" | "client");
      setOrganizationId(roleData.organization_id);

      // If client, load their accessible spaces
      if (roleData.role === "client") {
        const { data: accessData } = await supabase
          .from("portal_access")
          .select(`
            id,
            client_id,
            company_id,
            clients(id, first_name, last_name),
            companies(id, company_name)
          `)
          .eq("user_id", userId);

        if (accessData) {
          const loadedSpaces: PortalSpace[] = accessData.map((access: any) => {
            if (access.client_id && access.clients) {
              return {
                id: access.id,
                type: "client" as const,
                name: `${access.clients.first_name} ${access.clients.last_name}`,
                client_id: access.clients.id,
              };
            } else if (access.company_id && access.companies) {
              return {
                id: access.id,
                type: "company" as const,
                name: access.companies.company_name,
                company_id: access.companies.id,
              };
            }
            return null;
          }).filter(Boolean);

          setSpaces(loadedSpaces);
          if (loadedSpaces.length > 0) {
            setCurrentSpace(loadedSpaces[0]);
          }
        }
      }
    } catch (error) {
      console.error("Error loading portal data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadPortalData(session.user.id);
        } else {
          setRole(null);
          setOrganizationId(null);
          setSpaces([]);
          setCurrentSpace(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadPortalData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const switchSpace = (space: PortalSpace) => {
    setCurrentSpace(space);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <PortalContext.Provider
      value={{
        user,
        role,
        organizationId,
        spaces,
        currentSpace,
        loading,
        switchSpace,
        signOut,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
};
