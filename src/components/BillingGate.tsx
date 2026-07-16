import { Navigate, useLocation } from "react-router-dom";
import { useOrganization } from "@/lib/organization-context";
import { billingBlocksAccess } from "@/lib/billing-gate-model";

/**
 * T1-9: blocks the accountant app for organizations whose subscription has ended (billing_status
 * 'canceled'), redirecting them to /subscription so a cancelled org can no longer retain full
 * access indefinitely. Renders inside AppProvider so it reads the ACTIVE organization. Waits for
 * the org to load (no redirect while loading) and never redirects away from /subscription itself.
 */
export function BillingGate({ children }: { children: React.ReactNode }) {
  const { organization, loading } = useOrganization();
  const location = useLocation();

  if (!loading && organization && billingBlocksAccess(organization.billing_status, location.pathname)) {
    return <Navigate to="/subscription" replace />;
  }

  return <>{children}</>;
}
