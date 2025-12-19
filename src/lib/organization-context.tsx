import { createContext, ReactNode } from "react";
import { useApp, AppProvider } from "./app-context";

// Mirror the shape of the organization object for backward compatibility
export interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
  onboarding_completed: boolean;
  timezone: string | null;
  email_domain: string | null;
  billing_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export type OrganizationRole = "owner" | "admin" | "staff" | null;

export interface OrganizationContextType {
  organization: Organization | null;
  role: OrganizationRole;
  loading: boolean;
  error: string | null;
  refreshOrganization: () => Promise<void>;
}

// Dummy context for TypeScript - actual usage goes through useOrganization()
const OrganizationContext = createContext<OrganizationContextType>({
  organization: null,
  role: null,
  loading: true,
  error: null,
  refreshOrganization: async () => {},
});

// Re-export AppProvider as OrganizationProvider for backward compatibility
export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  return <AppProvider>{children}</AppProvider>;
};

// Bridge legacy useOrganization calls into useApp()
export const useOrganization = (): OrganizationContextType => {
  const {
    organization,
    role,
    organizationLoading,
    organizationError,
    refreshOrganization,
  } = useApp();

  return {
    organization: organization as Organization | null,
    role: role as OrganizationRole,
    loading: organizationLoading,
    error: organizationError,
    refreshOrganization,
  };
};
