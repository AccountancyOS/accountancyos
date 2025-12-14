import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SubmissionRequest {
  filingId: string;
  environment: 'test' | 'production';
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { filingId, environment = 'test' }: SubmissionRequest = await req.json();

    console.log(`[hmrc-ct-submit] Starting CT600 submission for filing ${filingId} in ${environment} mode`);

    // Get filing with related data
    const { data: filing, error: filingError } = await supabase
      .from('filings')
      .select(`
        *,
        company:company_id(
          company_name, company_number, utr,
          address_line_1, address_line_2, city, postcode, country
        ),
        ct_snapshot:ct_snapshot_id(*),
        accounts_snapshot:accounts_snapshot_id(*)
      `)
      .eq('id', filingId)
      .single();

    if (filingError || !filing) {
      console.error('[hmrc-ct-submit] Filing not found:', filingError);
      return new Response(
        JSON.stringify({ success: false, error: 'Filing not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Validate CT approval exists
    const { data: approval } = await supabase
      .from('filing_approvals')
      .select('*')
      .eq('filing_id', filingId)
      .eq('approval_scope', 'CT600')
      .is('revoked_at', null)
      .single();

    if (!approval) {
      console.error('[hmrc-ct-submit] CT600 approval required');
      return new Response(
        JSON.stringify({ success: false, error: 'CT600 approval required before submission' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate snapshot hash matches
    if (filing.ct_snapshot && approval.snapshot_hash !== filing.ct_snapshot.snapshot_hash) {
      console.error('[hmrc-ct-submit] Snapshot hash mismatch');
      return new Response(
        JSON.stringify({ success: false, error: 'Snapshot has changed since approval - re-approval required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get CT600 XML artefact
    const { data: ct600Artefact } = await supabase
      .from('filing_artefacts')
      .select('*')
      .eq('filing_id', filingId)
      .eq('artefact_type', 'CT600_XML')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!ct600Artefact) {
      console.error('[hmrc-ct-submit] CT600 XML artefact not found');
      return new Response(
        JSON.stringify({ success: false, error: 'CT600 XML artefact not found - generate filing documents first' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get iXBRL artefacts
    const { data: ixbrlArtefacts } = await supabase
      .from('filing_artefacts')
      .select('*')
      .eq('filing_id', filingId)
      .in('artefact_type', ['IXBRL_ACCOUNTS', 'IXBRL_CT_COMPUTATION'])
      .order('created_at', { ascending: false });

    // Check idempotency
    const idempotencyKey = `${filing.organization_id}:CT600:${filing.company_id}:${filing.period_start}:${filing.period_end}:${filing.ct_snapshot?.snapshot_hash}`;

    const { data: existingSubmission } = await supabase
      .from('filing_submissions')
      .select('id, ch_transaction_id, status')
      .eq('idempotency_key', idempotencyKey)
      .in('status', ['pending', 'accepted'])
      .maybeSingle();

    if (existingSubmission) {
      console.log('[hmrc-ct-submit] Duplicate submission detected');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Filing already submitted with this data',
          existingSubmissionId: existingSubmission.id 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      );
    }

    // Build fraud prevention headers
    const fraudPreventionHeaders: Record<string, string> = {
      'Gov-Client-Connection-Method': 'BATCH_PROCESS_DIRECT',
      'Gov-Client-User-Agent': 'AccountancyOS/1.0',
      'Gov-Vendor-Version': 'AccountancyOS=1.0.0',
      'Gov-Vendor-Product-Name': 'AccountancyOS',
    };

    // Get HMRC endpoint based on environment
    const hmrcBaseUrl = environment === 'production'
      ? 'https://www.tax.service.gov.uk'
      : 'https://test-api.service.hmrc.gov.uk';

    // Prepare submission payload
    const submissionPayload = {
      ct600Xml: ct600Artefact.content,
      ixbrlAccounts: ixbrlArtefacts?.find(a => a.artefact_type === 'IXBRL_ACCOUNTS')?.content,
      ixbrlComputation: ixbrlArtefacts?.find(a => a.artefact_type === 'IXBRL_CT_COMPUTATION')?.content,
      isAmendment: filing.is_amendment,
      originalReference: filing.is_amendment ? 
        (await supabase.from('filings').select('hmrc_receipt_number').eq('id', filing.original_filing_id).single()).data?.hmrc_receipt_number 
        : undefined
    };

    // Log submission attempt
    const { data: submission, error: submissionError } = await supabase
      .from('filing_submissions')
      .insert({
        organization_id: filing.organization_id,
        filing_id: filingId,
        environment,
        provider: 'hmrc_ct',
        request_payload: submissionPayload,
        request_headers: fraudPreventionHeaders,
        idempotency_key: idempotencyKey,
        status: 'pending'
      })
      .select('id')
      .single();

    if (submissionError) {
      console.error('[hmrc-ct-submit] Failed to log submission:', submissionError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create submission record' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    let responseData: any;
    let responseStatus: number;

    try {
      if (environment === 'test') {
        // Sandbox simulation - successful response
        console.log('[hmrc-ct-submit] Using sandbox simulation');
        
        // Simulate HMRC response
        const receiptReference = `HMRC-CT-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
        
        responseData = {
          success: true,
          correlationId: `COR-${Date.now()}`,
          receiptReference,
          timestamp: new Date().toISOString(),
          message: 'CT600 submission accepted for processing'
        };
        responseStatus = 200;
        
        // Update submission record
        await supabase
          .from('filing_submissions')
          .update({
            response_status_code: 200,
            response_payload: responseData,
            hmrc_receipt_number: receiptReference,
            status: 'accepted'
          })
          .eq('id', submission.id);

        // Update filing
        await supabase
          .from('filings')
          .update({
            status: 'submitted',
            submitted_at: new Date().toISOString(),
            hmrc_receipt_number: receiptReference,
            hmrc_response: responseData
          })
          .eq('id', filingId);

      } else {
        // Production submission - would call real HMRC API
        // For now, return error indicating production not yet configured
        console.log('[hmrc-ct-submit] Production submission not yet configured');
        
        responseData = {
          success: false,
          error: 'Production HMRC submission requires API credentials configuration'
        };
        responseStatus = 501;

        await supabase
          .from('filing_submissions')
          .update({
            response_status_code: 501,
            response_payload: responseData,
            status: 'failed',
            error_message: 'Production not configured'
          })
          .eq('id', submission.id);
      }
    } catch (apiError) {
      console.error('[hmrc-ct-submit] API error:', apiError);
      
      await supabase
        .from('filing_submissions')
        .update({
          response_status_code: 500,
          response_payload: { error: String(apiError) },
          status: 'failed',
          error_message: String(apiError)
        })
        .eq('id', submission.id);

      responseData = { success: false, error: 'HMRC API error' };
      responseStatus = 500;
    }

    console.log(`[hmrc-ct-submit] Completed with status ${responseStatus}`);

    return new Response(
      JSON.stringify(responseData),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: responseStatus 
      }
    );

  } catch (error) {
    console.error('[hmrc-ct-submit] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
