import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, corsHeaders } from "../_shared/cors.ts";

/**
 * SLA Check Edge Function
 * 
 * Runs on a schedule to:
 * 1. Mark overdue SLAs as breached
 * 2. Log breach events for automation triggers
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
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date().toISOString();
    const processedResults: {
      breached: number;
      eventsCreated: number;
      errors: string[];
    } = {
      breached: 0,
      eventsCreated: 0,
      errors: [],
    };

    // Find all active SLAs that are now past their due date
    const { data: overdueSlAs, error: fetchError } = await supabase
      .from("sla_instances")
      .select("id, organization_id, entity_type, entity_id, due_at, metadata")
      .eq("status", "active")
      .lt("due_at", now);

    if (fetchError) {
      throw new Error(`Failed to fetch overdue SLAs: ${fetchError.message}`);
    }

    if (!overdueSlAs || overdueSlAs.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No overdue SLAs found",
          processed: processedResults 
        }),
        { headers: corsHeaders(req) }
      );
    }

    console.log(`Found ${overdueSlAs.length} overdue SLAs to process`);

    // Process each overdue SLA
    for (const sla of overdueSlAs) {
      try {
        // Mark as breached
        const { error: updateError } = await supabase
          .from("sla_instances")
          .update({
            status: "breached",
            breached: true,
            breached_at: now,
          })
          .eq("id", sla.id);

        if (updateError) {
          processedResults.errors.push(`SLA ${sla.id}: ${updateError.message}`);
          continue;
        }

        processedResults.breached++;

        // Create automation event for breach
        const { error: eventError } = await supabase
          .from("automation_events")
          .insert({
            organization_id: sla.organization_id,
            entity_type: sla.entity_type,
            entity_id: sla.entity_id,
            event_type: "sla_breached",
            metadata: {
              sla_instance_id: sla.id,
              due_at: sla.due_at,
              breached_at: now,
              ...sla.metadata,
            },
          });

        if (eventError) {
          console.error(`Failed to create event for SLA ${sla.id}:`, eventError);
        } else {
          processedResults.eventsCreated++;
        }

      } catch (slaError: any) {
        processedResults.errors.push(`SLA ${sla.id}: ${slaError.message}`);
      }
    }

    // Also check for SLAs at risk (due within next 4 hours) and create warning events
    const fourHoursFromNow = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    
    const { data: atRiskSlAs } = await supabase
      .from("sla_instances")
      .select("id, organization_id, entity_type, entity_id, due_at, metadata")
      .eq("status", "active")
      .gt("due_at", now)
      .lt("due_at", fourHoursFromNow);

    if (atRiskSlAs && atRiskSlAs.length > 0) {
      console.log(`Found ${atRiskSlAs.length} SLAs at risk`);
      
      for (const sla of atRiskSlAs) {
        // Check if we already created a warning event recently
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        
        const { data: existingEvent } = await supabase
          .from("automation_events")
          .select("id")
          .eq("entity_id", sla.entity_id)
          .eq("event_type", "sla_at_risk")
          .gt("created_at", oneHourAgo)
          .maybeSingle();

        if (!existingEvent) {
          await supabase
            .from("automation_events")
            .insert({
              organization_id: sla.organization_id,
              entity_type: sla.entity_type,
              entity_id: sla.entity_id,
              event_type: "sla_at_risk",
              metadata: {
                sla_instance_id: sla.id,
                due_at: sla.due_at,
                ...sla.metadata,
              },
            });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${processedResults.breached} breached SLAs`,
        processed: processedResults,
        atRisk: atRiskSlAs?.length || 0,
      }),
      { headers: corsHeaders(req) }
    );

  } catch (error: any) {
    console.error("SLA check error:", error);
    
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
