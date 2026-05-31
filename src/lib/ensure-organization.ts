import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

const PENDING_ORG_NAME_KEY = "pending_org_name";

export function setPendingOrgName(name: string) {
  try {
    localStorage.setItem(PENDING_ORG_NAME_KEY, name);
  } catch {
    // ignore storage errors
  }
}

export function clearPendingOrgName() {
  try {
    localStorage.removeItem(PENDING_ORG_NAME_KEY);
  } catch {
    // ignore
  }
}

function defaultOrgName(user: User): string {
  const email = user.email || "";
  const local = email.split("@")[0] || "My";
  // Title-case the local part
  const pretty = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return `${pretty || "My"}'s Practice`;
}

/**
 * Ensure the current user has an organization. If they're already a member of
 * one, this is a no-op and returns the existing organization id. Otherwise it
 * creates one via the SECURITY DEFINER `create_organization_with_owner` RPC,
 * using (in order):
 *   1. localStorage `pending_org_name` (set during signup)
 *   2. `user_metadata.pending_org_name` (backup saved on the auth user)
 *   3. A sensible default derived from the user's email
 *
 * Safe to call multiple times. Returns the organization id or null on failure.
 */
export async function ensureOrganization(user: User): Promise<string | null> {
  // First, check if user already has an org
  const { data: existing, error: existingError } = await supabase
    .from("organization_users")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    console.error("[ensureOrganization] Failed to check membership:", existingError);
    return null;
  }

  if (existing?.organization_id) {
    clearPendingOrgName();
    return existing.organization_id;
  }

  // Resolve the org name
  let orgName: string | null = null;
  try {
    orgName = localStorage.getItem(PENDING_ORG_NAME_KEY);
  } catch {
    // ignore
  }
  if (!orgName) {
    const metaName = (user.user_metadata as { pending_org_name?: string } | undefined)
      ?.pending_org_name;
    if (metaName) orgName = metaName;
  }
  if (!orgName) {
    orgName = defaultOrgName(user);
  }

  const { data: orgId, error: orgError } = await supabase.rpc(
    "create_organization_with_owner",
    { org_name: orgName }
  );

  if (orgError) {
    console.error("[ensureOrganization] RPC failed:", orgError);
    return null;
  }

  if (!orgId) {
    console.error("[ensureOrganization] RPC returned no org id");
    return null;
  }

  clearPendingOrgName();
  // Store as pending_org_id for stripe checkout fallback
  try {
    localStorage.setItem("pending_org_id", orgId as string);
  } catch {
    // ignore
  }

  return orgId as string;
}