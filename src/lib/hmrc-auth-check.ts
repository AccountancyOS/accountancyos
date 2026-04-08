/**
 * HMRC Authorisation Check Service
 * Checks whether an entity has active HMRC authorisation for a given auth type.
 * Used to block job/filing work when authorisation is missing or expired.
 */

import { supabase } from "@/integrations/supabase/client";

export type HmrcAuthType = "personal" | "company" | "paye" | "vat";

interface HmrcAuthCheckResult {
  authorised: boolean;
  status: "active" | "pending" | "expired" | "revoked" | "missing";
  expiresAt?: string;
  message: string;
}

/**
 * Map service codes to the HMRC auth type required
 */
const SERVICE_TO_AUTH_TYPE: Record<string, HmrcAuthType> = {
  SA: "personal",
  SA_MTD: "personal",
  CT: "company",
  CT600: "company",
  VAT: "vat",
  VAT_RETURN: "vat",
  PAYE: "paye",
  RTI: "paye",
  CIS: "paye",
  P11D: "paye",
};

/**
 * Check if HMRC authorisation is active for a given entity and service.
 */
export async function checkHmrcAuthorisation(
  organizationId: string,
  serviceCode: string,
  entityId: { clientId?: string; companyId?: string }
): Promise<HmrcAuthCheckResult> {
  const authType = SERVICE_TO_AUTH_TYPE[serviceCode.toUpperCase()];
  if (!authType) {
    // Service doesn't require HMRC auth
    return { authorised: true, status: "active", message: "Service does not require HMRC authorisation" };
  }

  let query = supabase
    .from("hmrc_authorisations")
    .select("id, status, expires_at, auth_type")
    .eq("organization_id", organizationId)
    .eq("auth_type", authType);

  if (entityId.clientId) query = query.eq("client_id", entityId.clientId);
  if (entityId.companyId) query = query.eq("company_id", entityId.companyId);

  const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (error) {
    console.error("[HmrcAuthCheck] Query error:", error);
    return { authorised: false, status: "missing", message: "Failed to check HMRC authorisation" };
  }

  if (!data) {
    return {
      authorised: false,
      status: "missing",
      message: `HMRC ${authType.toUpperCase()} authorisation has not been requested for this entity. Request authorisation before proceeding.`,
    };
  }

  if (data.status === "revoked") {
    return {
      authorised: false,
      status: "revoked",
      message: `HMRC ${authType.toUpperCase()} authorisation has been revoked. A new authorisation is required.`,
    };
  }

  if (data.status === "pending") {
    return {
      authorised: false,
      status: "pending",
      message: `HMRC ${authType.toUpperCase()} authorisation is pending. Wait for confirmation before proceeding.`,
    };
  }

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return {
      authorised: false,
      status: "expired",
      expiresAt: data.expires_at,
      message: `HMRC ${authType.toUpperCase()} authorisation expired on ${new Date(data.expires_at).toLocaleDateString()}. Renew authorisation before proceeding.`,
    };
  }

  return {
    authorised: true,
    status: "active",
    expiresAt: data.expires_at || undefined,
    message: `HMRC ${authType.toUpperCase()} authorisation is active`,
  };
}

/**
 * React hook helper: check HMRC auth for use in components
 */
export function getHmrcAuthWarning(serviceCode: string): string | null {
  const authType = SERVICE_TO_AUTH_TYPE[serviceCode.toUpperCase()];
  if (!authType) return null;
  return `This service requires active HMRC ${authType.toUpperCase()} authorisation.`;
}
