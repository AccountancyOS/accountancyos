import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HMRC MTD VAT API endpoints
const HMRC_ENDPOINTS = {
  sandbox: 'https://test-api.service.hmrc.gov.uk',
  production: 'https://api.service.hmrc.gov.uk',
};

interface VATReturnPayload {
  periodKey: string;
  vatDueSales: number;
  vatDueAcquisitions: number;
  totalVatDue: number;
  vatReclaimedCurrPeriod: number;
  netVatDue: number;
  totalValueSalesExVAT: number;
  totalValuePurchasesExVAT: number;
  totalValueGoodsSuppliedExVAT: number;
  totalAcquisitionsExVAT: number;
  finalised: boolean;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Get auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const { 
      filingId, 
      snapshotId, 
      environment = 'sandbox',
      vrn // VAT Registration Number
    } = await req.json();

    if (!filingId && !snapshotId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Either filingId or snapshotId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate environment
    if (!['sandbox', 'production'].includes(environment)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid environment. Must be "sandbox" or "production"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let filing: any = null;
    let snapshot: any = null;
    let organizationId: string;
    let companyId: string | null = null;

    // If filingId provided, fetch filing and its snapshot
    if (filingId) {
      const { data: filingData, error: filingError } = await supabase
        .from('filings')
        .select(`
          *,
          companies(id, vat_number, company_name),
          filing_model_snapshots(*)
        `)
        .eq('id', filingId)
        .single();

      if (filingError || !filingData) {
        return new Response(
          JSON.stringify({ success: false, message: 'Filing not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      filing = filingData;
      snapshot = filingData.filing_model_snapshots;
      organizationId = filing.organization_id;
      companyId = filing.company_id;

      // Check idempotency
      if (filing.idempotency_key) {
        const { data: existingSubmission } = await supabase
          .from('filing_submissions')
          .select('id, status, ch_transaction_id')
          .eq('idempotency_key', filing.idempotency_key)
          .eq('status', 'accepted')
          .maybeSingle();

        if (existingSubmission) {
          console.log('Duplicate submission detected, returning existing result');
          return new Response(
            JSON.stringify({
              success: true,
              duplicate: true,
              message: 'This filing has already been submitted and accepted',
              submissionId: existingSubmission.id,
              receiptId: existingSubmission.ch_transaction_id,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    } else {
      // Fetch snapshot directly
      const { data: snapshotData, error: snapshotError } = await supabase
        .from('filing_model_snapshots')
        .select('*')
        .eq('id', snapshotId)
        .single();

      if (snapshotError || !snapshotData) {
        return new Response(
          JSON.stringify({ success: false, message: 'Snapshot not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      snapshot = snapshotData;
      organizationId = snapshot.organization_id;
      companyId = snapshot.company_id;
    }

    // Verify org access
    const { data: orgUser, error: orgError } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .single();

    if (orgError || !orgUser) {
      return new Response(
        JSON.stringify({ success: false, message: 'Access denied to organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get company VAT number
    let vatNumber = vrn;
    if (!vatNumber && companyId) {
      const { data: company } = await supabase
        .from('companies')
        .select('vat_number')
        .eq('id', companyId)
        .single();
      
      vatNumber = company?.vat_number;
    }

    if (!vatNumber) {
      return new Response(
        JSON.stringify({ success: false, message: 'VAT Registration Number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get HMRC OAuth token for this organization
    const { data: hmrcAuth, error: hmrcAuthError } = await supabase
      .from('organization_integrations_hmrc')
      .select('access_token, refresh_token, token_expires_at')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (hmrcAuthError || !hmrcAuth?.access_token) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'HMRC MTD authorization not configured. Please connect your HMRC account first.',
          error_code: 'HMRC_NOT_CONNECTED'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build VAT return payload from snapshot
    const snapshotData = snapshot?.snapshot_data || {};
    const vatPayload = buildVATReturnPayload(snapshotData, filing);

    // Validate the payload
    const validationErrors = validateVATPayload(vatPayload);
    if (validationErrors.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'VAT return validation failed',
          errors: validationErrors,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate correlation ID for this submission
    const correlationId = `VAT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const idempotencyKey = snapshot 
      ? `${organizationId}::HMRC::VAT::${companyId || 'org'}::${snapshot.period_start}::${snapshot.period_end}::${snapshot.snapshot_hash}`
      : `${organizationId}::HMRC::VAT::${companyId || 'org'}::${correlationId}`;

    // Create submission record
    const { data: submission, error: submissionError } = await supabase
      .from('filing_submissions')
      .insert({
        filing_id: filingId || null,
        organization_id: organizationId,
        environment,
        filing_type: 'VAT_RETURN',
        provider: 'HMRC',
        correlation_id: correlationId,
        snapshot_id: snapshot?.id || null,
        idempotency_key: idempotencyKey,
        request_payload: JSON.stringify(vatPayload),
        status: 'pending',
      })
      .select('id')
      .single();

    if (submissionError) {
      console.error('Failed to create submission record:', submissionError);
    }

    // Submit to HMRC
    console.log(`Submitting VAT return to HMRC (${environment})...`);
    const hmrcEndpoint = `${HMRC_ENDPOINTS[environment as keyof typeof HMRC_ENDPOINTS]}/organisations/vat/${vatNumber}/returns`;

    let hmrcResponse: Response;
    let responseBody: any;

    try {
      hmrcResponse = await fetch(hmrcEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hmrcAuth.access_token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.hmrc.1.0+json',
          'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
          'Gov-Client-User-IDs': `os=${user.id}`,
        },
        body: JSON.stringify(vatPayload),
      });

      responseBody = await hmrcResponse.json();
      console.log(`HMRC Response status: ${hmrcResponse.status}`);
    } catch (fetchError: any) {
      console.error('Failed to call HMRC API:', fetchError);

      if (submission?.id) {
        await supabase
          .from('filing_submissions')
          .update({
            status: 'error',
            error_message: fetchError.message,
            response_status_code: 0,
          })
          .eq('id', submission.id);
      }

      return new Response(
        JSON.stringify({
          success: false,
          status: 'error',
          message: `Failed to connect to HMRC: ${fetchError.message}`,
          submissionId: submission?.id,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse response
    const isSuccess = hmrcResponse.status >= 200 && hmrcResponse.status < 300;
    const receiptId = responseBody?.processingDate || responseBody?.formBundleNumber;
    const hmrcErrors = responseBody?.errors || [];

    // Update submission record
    if (submission?.id) {
      await supabase
        .from('filing_submissions')
        .update({
          response_status_code: hmrcResponse.status,
          response_payload: JSON.stringify(responseBody),
          ch_transaction_id: receiptId, // Reusing field for receipt ID
          status: isSuccess ? 'accepted' : 'rejected',
          error_message: isSuccess ? null : hmrcErrors[0]?.message || 'Submission rejected',
        })
        .eq('id', submission.id);
    }

    // Update filing record if present
    if (filingId) {
      const filingUpdate: Record<string, any> = {
        environment,
        submitted_at: new Date().toISOString(),
        last_submission_error: isSuccess ? null : hmrcErrors[0]?.message,
        retry_count: isSuccess ? filing?.retry_count || 0 : (filing?.retry_count || 0) + 1,
      };

      if (isSuccess) {
        filingUpdate.status = 'filed';
        filingUpdate.filed_at = new Date().toISOString();
        filingUpdate.filing_reference = receiptId;
        filingUpdate.is_locked = true;
        filingUpdate.filing_receipt = responseBody;
      } else {
        filingUpdate.status = 'failed';
        filingUpdate.error_code = hmrcErrors[0]?.code || 'UNKNOWN';
        filingUpdate.error_detail = { errors: hmrcErrors, response: responseBody };
        // Set retry time for transient errors
        if (hmrcResponse.status >= 500) {
          const retryDelay = Math.pow(2, (filing?.retry_count || 0) + 1) * 60000; // Exponential backoff
          filingUpdate.next_retry_at = new Date(Date.now() + retryDelay).toISOString();
        }
      }

      await supabase
        .from('filings')
        .update(filingUpdate)
        .eq('id', filingId);
    }

    // Log audit event
    await supabase
      .from('audit_log')
      .insert({
        organization_id: organizationId,
        entity_type: 'filing',
        entity_id: filingId || submission?.id || 'vat-submit',
        action: 'hmrc_vat_submit',
        user_id: user.id,
        metadata: {
          environment,
          vrn: vatNumber,
          period_key: vatPayload.periodKey,
          status: isSuccess ? 'accepted' : 'rejected',
          receipt_id: receiptId,
          submission_id: submission?.id,
        },
      });

    console.log(`VAT submission complete: ${isSuccess ? 'accepted' : 'rejected'}`);

    return new Response(
      JSON.stringify({
        success: isSuccess,
        submissionId: submission?.id,
        receiptId,
        processingDate: responseBody?.processingDate,
        status: isSuccess ? 'accepted' : 'rejected',
        message: isSuccess ? 'VAT return submitted successfully' : hmrcErrors[0]?.message,
        errors: isSuccess ? [] : hmrcErrors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in hmrc-vat-submit:', error);
    return new Response(
      JSON.stringify({ success: false, status: 'error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Build VAT return payload from snapshot data
function buildVATReturnPayload(snapshotData: any, filing: any): VATReturnPayload {
  // Check if snapshot contains pre-built VAT model
  if (snapshotData.vat_model) {
    return snapshotData.vat_model;
  }

  // Otherwise build from field values
  const fields = snapshotData.field_values || snapshotData;
  
  const box1 = roundDecimals(Number(fields.box1_vat_on_sales || fields.vatDueSales || 0), 2);
  const box2 = roundDecimals(Number(fields.box2_vat_on_acquisitions || fields.vatDueAcquisitions || 0), 2);
  const box3 = roundDecimals(box1 + box2, 2);
  const box4 = roundDecimals(Number(fields.box4_vat_reclaimed || fields.vatReclaimedCurrPeriod || 0), 2);
  const box5 = roundDecimals(Math.abs(box3 - box4), 2);
  const box6 = Math.round(Number(fields.box6_total_sales_ex_vat || fields.totalValueSalesExVAT || 0));
  const box7 = Math.round(Number(fields.box7_total_purchases_ex_vat || fields.totalValuePurchasesExVAT || 0));
  const box8 = Math.round(Number(fields.box8_goods_supplied_ex_vat || fields.totalValueGoodsSuppliedExVAT || 0));
  const box9 = Math.round(Number(fields.box9_acquisitions_ex_vat || fields.totalAcquisitionsExVAT || 0));

  return {
    periodKey: fields.period_key || fields.periodKey || filing?.filing_data?.period_key || '',
    vatDueSales: box1,
    vatDueAcquisitions: box2,
    totalVatDue: box3,
    vatReclaimedCurrPeriod: box4,
    netVatDue: box5,
    totalValueSalesExVAT: box6,
    totalValuePurchasesExVAT: box7,
    totalValueGoodsSuppliedExVAT: box8,
    totalAcquisitionsExVAT: box9,
    finalised: true,
  };
}

function roundDecimals(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

function validateVATPayload(payload: VATReturnPayload): string[] {
  const errors: string[] = [];

  if (!payload.periodKey || payload.periodKey.length !== 4) {
    errors.push('Invalid period key - must be 4 characters');
  }

  // Box 3 must equal Box 1 + Box 2
  const expectedBox3 = roundDecimals(payload.vatDueSales + payload.vatDueAcquisitions, 2);
  if (Math.abs(payload.totalVatDue - expectedBox3) > 0.01) {
    errors.push(`Box 3 must equal Box 1 + Box 2`);
  }

  // Box 5 must equal |Box 3 - Box 4|
  const expectedBox5 = roundDecimals(Math.abs(payload.totalVatDue - payload.vatReclaimedCurrPeriod), 2);
  if (Math.abs(payload.netVatDue - expectedBox5) > 0.01) {
    errors.push(`Box 5 must equal |Box 3 - Box 4|`);
  }

  // Boxes 6-9 must be whole numbers
  if (!Number.isInteger(payload.totalValueSalesExVAT)) {
    errors.push('Box 6 must be a whole number');
  }
  if (!Number.isInteger(payload.totalValuePurchasesExVAT)) {
    errors.push('Box 7 must be a whole number');
  }
  if (!Number.isInteger(payload.totalValueGoodsSuppliedExVAT)) {
    errors.push('Box 8 must be a whole number');
  }
  if (!Number.isInteger(payload.totalAcquisitionsExVAT)) {
    errors.push('Box 9 must be a whole number');
  }

  return errors;
}
