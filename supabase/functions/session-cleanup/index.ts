import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, corsHeaders } from "../_shared/cors.ts";

/**
 * Session Cleanup Edge Function
 * 
 * Runs on a schedule to:
 * 1. Delete expired user sessions based on org session_timeout_minutes
 * 2. Log cleanup for compliance
 * 
 * Designed to be called by pg_cron or external scheduler
 */

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");

    // Verify cron secret for scheduled invocations
    const providedSecret = req.headers.get("X-Cron-Secret");
    if (!cronSecret || providedSecret !== cronSecret) {
      console.error("[session-cleanup] Unauthorized: invalid or missing cron secret");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: corsHeaders(req) }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const results = {
      sessionsDeleted: 0,
      orgsProcessed: 0,
      errors: [] as string[],
    };

    // Get all organizations with their session settings
    const { data: orgs, error: orgError } = await supabase
      .from("org_settings")
      .select("organization_id, session_timeout_minutes");

    if (orgError) {
      throw new Error(`Failed to fetch org settings: ${orgError.message}`);
    }

    // Process each organization
    for (const org of orgs || []) {
      try {
        // Default to 8 hours (480 minutes) if not set
        const timeoutMinutes = org.session_timeout_minutes || 480;
        const expiryThreshold = new Date(now.getTime() - timeoutMinutes * 60 * 1000);

        // Delete expired sessions for this organization
        const { count, error: deleteError } = await supabase
          .from("user_sessions")
          .delete({ count: "exact" })
          .eq("organization_id", org.organization_id)
          .lt("last_active_at", expiryThreshold.toISOString());

        if (deleteError) {
          results.errors.push(`Org ${org.organization_id}: ${deleteError.message}`);
          continue;
        }

        if (count && count > 0) {
          results.sessionsDeleted += count;
          console.log(`Deleted ${count} expired sessions for org ${org.organization_id}`);
        }

        results.orgsProcessed++;

      } catch (orgProcessError: any) {
        results.errors.push(`Org ${org.organization_id}: ${orgProcessError.message}`);
      }
    }

    // Also clean up sessions for organizations without settings (use 8 hour default)
    const defaultExpiryThreshold = new Date(now.getTime() - 8 * 60 * 60 * 1000);
    
    const { count: orphanCount, error: orphanError } = await supabase
      .from("user_sessions")
      .delete({ count: "exact" })
      .lt("last_active_at", defaultExpiryThreshold.toISOString())
      .is("organization_id", null);

    if (!orphanError && orphanCount) {
      results.sessionsDeleted += orphanCount;
      console.log(`Deleted ${orphanCount} orphan expired sessions`);
    }

    // Log the cleanup action for compliance
    await supabase
      .from("audit_log")
      .insert({
        organization_id: "00000000-0000-0000-0000-000000000000", // System action
        entity_type: "system",
        entity_id: "session-cleanup",
        action: "session_cleanup",
        metadata: {
          sessions_deleted: results.sessionsDeleted,
          orgs_processed: results.orgsProcessed,
          run_at: now.toISOString(),
        },
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleaned up ${results.sessionsDeleted} expired sessions`,
        results,
      }),
      { headers: corsHeaders(req) }
    );

  } catch (error: any) {
    console.error("Session cleanup error:", error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: corsHeaders(req)
      }
    );
  }
});
