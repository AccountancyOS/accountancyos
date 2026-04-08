/**
 * Concurrent Session Enforcement
 * Limits active sessions per user based on subscription tier.
 * Called during login to invalidate excess sessions.
 */

import { supabase } from "@/integrations/supabase/client";

const TIER_SESSION_LIMITS: Record<string, number> = {
  solo: 1,
  studio: 4,
  firm: 10,
  free: 1,
};

const DEFAULT_SESSION_LIMIT = 2;

/**
 * Enforce concurrent session limits for a user.
 * Called after successful authentication to ensure session count stays within tier limits.
 * Invalidates oldest sessions beyond the limit.
 */
export async function enforceSessionLimits(
  userId: string,
  organizationId: string
): Promise<{ invalidated: number; error?: string }> {
  try {
    // 1. Get org subscription tier
    const { data: org } = await supabase
      .from("organizations")
      .select("subscription_tier")
      .eq("id", organizationId)
      .single();

    const tier = org?.subscription_tier || "free";
    const maxSessions = TIER_SESSION_LIMITS[tier] || DEFAULT_SESSION_LIMIT;

    // 2. Get active sessions for this user, ordered by most recent
    const { data: sessions, error: sessError } = await supabase
      .from("user_sessions")
      .select("id, created_at")
      .eq("user_id", userId)
      .is("invalidated_at", null)
      .order("last_activity_at", { ascending: false });

    if (sessError || !sessions) {
      console.warn("[SessionEnforcement] Failed to query sessions:", sessError);
      return { invalidated: 0, error: sessError?.message };
    }

    // 3. If within limit, nothing to do
    if (sessions.length <= maxSessions) {
      return { invalidated: 0 };
    }

    // 4. Invalidate excess (oldest) sessions
    const sessionsToInvalidate = sessions.slice(maxSessions);
    const idsToInvalidate = sessionsToInvalidate.map((s) => s.id);

    const { error: updateError } = await supabase
      .from("user_sessions")
      .update({
        invalidated_at: new Date().toISOString(),
        invalidated_reason: "concurrent_session_limit",
      })
      .in("id", idsToInvalidate);

    if (updateError) {
      console.warn("[SessionEnforcement] Failed to invalidate sessions:", updateError);
      return { invalidated: 0, error: updateError.message };
    }

    console.info(
      `[SessionEnforcement] Invalidated ${idsToInvalidate.length} excess sessions for user ${userId} (tier: ${tier}, limit: ${maxSessions})`
    );

    return { invalidated: idsToInvalidate.length };
  } catch (err: any) {
    console.error("[SessionEnforcement] Error:", err);
    return { invalidated: 0, error: err.message };
  }
}
