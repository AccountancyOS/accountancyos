import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

const PENDING_ORG_NAME_KEY = "pending_org_name";

export function setPendingOrgName(name: string) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(PENDING_ORG_NAME_KEY, trimmed);
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
 * which is itself idempotent and race-safe at the database layer (UNIQUE
 * constraint on organization_users.user_id).
 *
 * In-flight calls share a single promise so two parallel callers (auth
 * listener + /complete-payment self-heal) only hit the RPC once per user.
 *
 * Name resolution order:
 *   1. localStorage `pending_org_name` (set during signup)
 *   2. `user.user_metadata.pending_org_name`
 *   3. Email-derived default ("<local-part>'s Practice")
 */
let inFlight: { userId: string; promise: Promise<string | null> } | null = null;

async function doEnsure(user: User): Promise<string | null> {
  console.log("[ensureOrg] start", { uid: user.id });

  // 1. Membership lookup (ordered + limit 1 for resilience against any
  //    historical duplicate rows before the unique constraint applied).
  const { data: existing, error: existingError } = await supabase
    .from("organization_users")
    .select("organization_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("[ensureOrg] membership lookup failed", existingError);
    return null;
  }

  if (existing?.organization_id) {
    console.log("[ensureOrg] existing membership", existing.organization_id);
    clearPendingOrgName();
    try {
      localStorage.setItem("pending_org_id", existing.organization_id);
    } catch {
      // ignore
    }
    return existing.organization_id;
  }

  // 2. Resolve the org name.
  let orgName: string | null = null;
  try {
    const stored = localStorage.getItem(PENDING_ORG_NAME_KEY);
    if (stored && stored.trim()) orgName = stored.trim();
  } catch {
    // ignore
  }
  if (!orgName) {
    const metaName = (user.user_metadata as { pending_org_name?: string } | undefined)
      ?.pending_org_name;
    if (metaName && metaName.trim()) orgName = metaName.trim();
  }
  if (!orgName) orgName = defaultOrgName(user);

  console.log("[ensureOrg] no membership, calling RPC", { orgName });

  const { data: orgId, error: orgError } = await supabase.rpc(
    "create_organization_with_owner",
    { org_name: orgName },
  );

  if (orgError) {
    console.error("[ensureOrg] RPC failed", orgError);
    return null;
  }

  if (!orgId) {
    console.error("[ensureOrg] RPC returned no org id");
    return null;
  }

  console.log("[ensureOrg] RPC returned", orgId);
  clearPendingOrgName();
  try {
    localStorage.setItem("pending_org_id", orgId as string);
  } catch {
    // ignore
  }

  return orgId as string;
}

export async function ensureOrganization(user: User): Promise<string | null> {
  if (!user?.id) return null;

  // Share a single in-flight promise per user so parallel callers don't race.
  if (inFlight && inFlight.userId === user.id) {
    return inFlight.promise;
  }

  const promise = doEnsure(user).finally(() => {
    if (inFlight && inFlight.userId === user.id) inFlight = null;
  });
  inFlight = { userId: user.id, promise };
  return promise;
}