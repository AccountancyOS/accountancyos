import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RTISubmitRequest {
  filingId: string;
  messageType: "FPS" | "EPS" | "P45" | "P46" | "EYU" | "NVR";
  xmlPayload: string;
  organizationId: string;
  payRunId?: string;
  taxYear?: string;
  taxMonth?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: RTISubmitRequest = await req.json();
    const { filingId, messageType, xmlPayload, organizationId, payRunId, taxYear, taxMonth } = body;

    console.log(`[RTI Submit] Processing ${messageType} submission for filing ${filingId}`);

    // Validate required fields
    if (!filingId || !messageType || !xmlPayload || !organizationId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SEC-2/Fix 2: this runs on the service-role key, so verify_jwt alone is not a trust
    // boundary (the anon key is a valid JWT). Authenticate the caller, then authorize against
    // the filing's OWN organization (never trust the body filingId/organizationId).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: filingRow, error: filingErr } = await supabase
      .from("filings").select("organization_id").eq("id", filingId).maybeSingle();
    if (filingErr || !filingRow) {
      return new Response(
        JSON.stringify({ error: "Filing not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (filingRow.organization_id !== organizationId) {
      return new Response(
        JSON.stringify({ error: "Organization mismatch" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: membership, error: memberError } = await supabase
      .from("organization_users").select("organization_id")
      .eq("user_id", user.id).eq("organization_id", filingRow.organization_id).maybeSingle();
    if (memberError || !membership) {
      return new Response(
        JSON.stringify({ error: "Access denied to organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // In sandbox mode, simulate HMRC response
    const isSandbox = Deno.env.get('HMRC_MODE') !== 'production';
    
    let hmrcResponse: {
      success: boolean;
      correlationId: string;
      hmrcReference?: string;
      message: string;
      errors?: { code: string; message: string }[];
    };

    if (isSandbox) {
      // Simulate HMRC sandbox response
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
      
      const correlationId = `HMRC-RTI-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const hmrcReference = `RTI-${messageType}-${Date.now().toString(36).toUpperCase()}`;
      
      // Simulate validation
      const xmlValidation = validateRTIXml(xmlPayload, messageType);
      
      if (!xmlValidation.isValid) {
        hmrcResponse = {
          success: false,
          correlationId,
          message: "Validation failed",
          errors: xmlValidation.errors,
        };
      } else {
        hmrcResponse = {
          success: true,
          correlationId,
          hmrcReference,
          message: `${messageType} accepted (sandbox mode)`,
        };
      }
    } else {
      // Production: Call actual HMRC RTI API
      // This would involve:
      // 1. Fetching Government Gateway credentials from organization settings
      // 2. Building SOAP envelope with authentication
      // 3. Submitting to HMRC RTI endpoint
      // 4. Parsing response
      
      hmrcResponse = {
        success: false,
        correlationId: "N/A",
        message: "Production RTI submission not yet implemented",
      };
    }

    // Create transport log entry in rti_submissions
    const { data: submission, error: insertError } = await supabase
      .from("rti_submissions")
      .insert({
        organization_id: organizationId,
        filing_id: filingId,
        pay_run_id: payRunId,
        submission_type: messageType,
        tax_year: taxYear,
        tax_month: taxMonth,
        status: hmrcResponse.success ? "accepted" : "rejected",
        xml_payload: xmlPayload,
        hmrc_response: hmrcResponse,
        correlation_id: hmrcResponse.correlationId,
        hmrc_reference: hmrcResponse.hmrcReference,
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("[RTI Submit] Failed to create submission log:", insertError);
    }

    // Update filing with submission result
    await supabase
      .from("filings")
      .update({
        api_submission_id: hmrcResponse.correlationId,
        api_response: hmrcResponse,
        status: hmrcResponse.success ? "filed" : "rejected",
        filed_at: hmrcResponse.success ? new Date().toISOString() : null,
        filing_reference: hmrcResponse.hmrcReference,
      })
      .eq("id", filingId);

    console.log(`[RTI Submit] ${messageType} submission ${hmrcResponse.success ? "succeeded" : "failed"}: ${hmrcResponse.correlationId}`);

    return new Response(
      JSON.stringify({
        success: hmrcResponse.success,
        correlationId: hmrcResponse.correlationId,
        hmrcReference: hmrcResponse.hmrcReference,
        message: hmrcResponse.message,
        errors: hmrcResponse.errors,
        submissionId: submission?.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[RTI Submit] Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Basic XML validation for sandbox
function validateRTIXml(xml: string, messageType: string): { isValid: boolean; errors: { code: string; message: string }[] } {
  const errors: { code: string; message: string }[] = [];
  
  // Check basic XML structure
  if (!xml.includes("<?xml")) {
    errors.push({ code: "XML_INVALID", message: "Missing XML declaration" });
  }
  
  // Check for required elements based on message type
  if (messageType === "FPS") {
    if (!xml.includes("<FullPaymentSubmission>")) {
      errors.push({ code: "FPS_MISSING_ROOT", message: "Missing FullPaymentSubmission element" });
    }
    if (!xml.includes("<Employee>")) {
      errors.push({ code: "FPS_NO_EMPLOYEES", message: "No employee data found" });
    }
    if (!xml.includes("<EmpRefs>")) {
      errors.push({ code: "FPS_MISSING_EMPREFS", message: "Missing employer references" });
    }
  } else if (messageType === "EPS") {
    if (!xml.includes("<EmployerPaymentSummary>")) {
      errors.push({ code: "EPS_MISSING_ROOT", message: "Missing EmployerPaymentSummary element" });
    }
  } else if (messageType === "P45") {
    if (!xml.includes("<P45>") && !xml.includes("<LeavingDate>")) {
      errors.push({ code: "P45_MISSING_DATA", message: "Missing P45 or leaving date data" });
    }
  }
  
  // Check for PAYE reference
  if (!xml.includes("<OfficeNo>") || !xml.includes("<PayeRef>")) {
    errors.push({ code: "MISSING_PAYE_REF", message: "Missing PAYE reference details" });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}
