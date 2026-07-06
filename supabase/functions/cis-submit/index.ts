import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CISSubmitRequest {
  filingId: string;
  returnType: "MONTHLY_RETURN" | "VERIFICATION";
  xmlPayload: string;
  organizationId: string;
  cisReturnId?: string;
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

    const body: CISSubmitRequest = await req.json();
    const { filingId, returnType, xmlPayload, organizationId, cisReturnId, taxYear, taxMonth } = body;

    console.log(`[CIS Submit] Processing ${returnType} for filing ${filingId}`);

    // Validate required fields
    if (!filingId || !returnType || !xmlPayload || !organizationId) {
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
      hmrcReceiptNumber?: string;
      message: string;
      errors?: { code: string; message: string }[];
      verificationResult?: {
        verificationNumber?: string;
        deductionRate: string;
        matchedName?: string;
      };
    };

    if (isSandbox) {
      // Simulate HMRC sandbox response
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
      
      const correlationId = `HMRC-CIS-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      // Simulate validation
      const xmlValidation = validateCISXml(xmlPayload, returnType);
      
      if (!xmlValidation.isValid) {
        hmrcResponse = {
          success: false,
          correlationId,
          message: "Validation failed",
          errors: xmlValidation.errors,
        };
      } else if (returnType === "VERIFICATION") {
        // Simulate verification response
        const mockVerificationNumber = `V${Date.now().toString(36).toUpperCase().substring(0, 10)}`;
        hmrcResponse = {
          success: true,
          correlationId,
          message: "Verification successful (sandbox mode)",
          verificationResult: {
            verificationNumber: mockVerificationNumber,
            deductionRate: "S", // Standard rate
            matchedName: "Matched Subcontractor Name",
          },
        };
      } else {
        // Monthly return response
        const hmrcReceiptNumber = `CIS-${taxYear?.replace("/", "")}-${String(taxMonth).padStart(2, "0")}-${Date.now().toString(36).toUpperCase()}`;
        hmrcResponse = {
          success: true,
          correlationId,
          hmrcReference: `CIS-REF-${Date.now().toString(36).toUpperCase()}`,
          hmrcReceiptNumber,
          message: "CIS return accepted (sandbox mode)",
        };
      }
    } else {
      // Production: Call actual HMRC CIS API
      hmrcResponse = {
        success: false,
        correlationId: "N/A",
        message: "Production CIS submission not yet implemented",
      };
    }

    // Update cis_returns table if this is a monthly return
    if (cisReturnId && returnType === "MONTHLY_RETURN") {
      await supabase
        .from("cis_returns")
        .update({
          status: hmrcResponse.success ? "submitted" : "rejected",
          submitted_at: hmrcResponse.success ? new Date().toISOString() : null,
          hmrc_receipt_number: hmrcResponse.hmrcReceiptNumber,
          hmrc_response: hmrcResponse,
        })
        .eq("id", cisReturnId);
    }

    // Update filing with submission result
    await supabase
      .from("filings")
      .update({
        api_submission_id: hmrcResponse.correlationId,
        api_response: hmrcResponse,
        status: hmrcResponse.success ? "filed" : "rejected",
        filed_at: hmrcResponse.success ? new Date().toISOString() : null,
        filing_reference: hmrcResponse.hmrcReference || hmrcResponse.hmrcReceiptNumber,
      })
      .eq("id", filingId);

    console.log(`[CIS Submit] ${returnType} submission ${hmrcResponse.success ? "succeeded" : "failed"}: ${hmrcResponse.correlationId}`);

    return new Response(
      JSON.stringify({
        success: hmrcResponse.success,
        correlationId: hmrcResponse.correlationId,
        hmrcReference: hmrcResponse.hmrcReference,
        hmrcReceiptNumber: hmrcResponse.hmrcReceiptNumber,
        message: hmrcResponse.message,
        errors: hmrcResponse.errors,
        verificationResult: hmrcResponse.verificationResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[CIS Submit] Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Basic XML validation for sandbox
function validateCISXml(xml: string, returnType: string): { isValid: boolean; errors: { code: string; message: string }[] } {
  const errors: { code: string; message: string }[] = [];
  
  // Check basic XML structure
  if (!xml.includes("<?xml")) {
    errors.push({ code: "XML_INVALID", message: "Missing XML declaration" });
  }
  
  if (returnType === "MONTHLY_RETURN") {
    if (!xml.includes("<CISMonthlyReturn>")) {
      errors.push({ code: "CIS_MISSING_ROOT", message: "Missing CISMonthlyReturn element" });
    }
    if (!xml.includes("<Contractor>")) {
      errors.push({ code: "CIS_MISSING_CONTRACTOR", message: "Missing Contractor element" });
    }
    if (!xml.includes("<Declarations>")) {
      errors.push({ code: "CIS_MISSING_DECLARATIONS", message: "Missing Declarations element" });
    }
    // Check for UTR
    if (!xml.includes("<UTR>")) {
      errors.push({ code: "CIS_MISSING_UTR", message: "Missing contractor UTR" });
    }
  } else if (returnType === "VERIFICATION") {
    if (!xml.includes("<CISVerificationRequest>")) {
      errors.push({ code: "CIS_VERIFY_MISSING_ROOT", message: "Missing CISVerificationRequest element" });
    }
    if (!xml.includes("<Subcontractor>")) {
      errors.push({ code: "CIS_VERIFY_MISSING_SUB", message: "Missing Subcontractor element" });
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}
