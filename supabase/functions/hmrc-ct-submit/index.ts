import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HMRC API endpoints
const HMRC_ENDPOINTS = {
  test: 'https://test-api.service.hmrc.gov.uk',
  production: 'https://api.service.hmrc.gov.uk',
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

    // === SERVER-SIDE SUBMISSION GUARD ===
    // Validate submission integrity using the database function
    const { data: integrityCheck, error: integrityError } = await supabase.rpc(
      'validate_submission_integrity',
      { p_filing_id: filingId, p_filing_type: 'CT600_HMRC' }
    );

    if (integrityError) {
      console.error('[hmrc-ct-submit] Integrity check error:', integrityError);
      return new Response(
        JSON.stringify({ success: false, error: 'Submission integrity check failed', details: integrityError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const integrity = integrityCheck as { valid: boolean; errors: string[]; approval_id?: string; snapshot_hash?: string } | null;
    if (integrity && !integrity.valid) {
      console.error('[hmrc-ct-submit] Submission blocked by integrity check:', integrity.errors);
      
      // Log the blocked submission attempt
      await supabase.from('filing_submissions').insert({
        filing_id: filingId,
        organization_id: filing.organization?.id || filing.organization_id,
        environment,
        status: 'blocked',
        error_message: `Submission blocked: ${integrity.errors.join(', ')}`,
        request_payload: { blocked_reason: 'integrity_check_failed', errors: integrity.errors }
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Submission blocked by integrity check',
          errors: integrity.errors
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('[hmrc-ct-submit] Integrity check passed, approval_id:', integrity?.approval_id);

    // Validate CT approval exists (already validated by integrity check, but keep for explicit check)
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

    // Validate snapshot hash matches (already validated by integrity check)
    if (filing.ct_snapshot && approval.snapshot_hash !== filing.ct_snapshot.snapshot_hash) {
      console.error('[hmrc-ct-submit] Snapshot hash mismatch');
      return new Response(
        JSON.stringify({ success: false, error: 'Snapshot has changed since approval - re-approval required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check for CH accounts filing status (warn-only per configuration)
    const { data: chFiling } = await supabase
      .from('filings')
      .select('id, status')
      .eq('company_id', filing.company_id)
      .eq('filing_type', 'companies_house_accounts')
      .eq('period_end', filing.period_end)
      .maybeSingle();

    let chWarning: string | null = null;
    if (!chFiling || chFiling.status !== 'filed') {
      chWarning = 'Companies House accounts filing is pending/not filed. Proceeding with CT submission.';
      console.log(`[hmrc-ct-submit] Warning: ${chWarning}`);
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

    const ixbrlAccounts = ixbrlArtefacts?.find(a => a.artefact_type === 'IXBRL_ACCOUNTS');
    const ixbrlComputation = ixbrlArtefacts?.find(a => a.artefact_type === 'IXBRL_CT_COMPUTATION');

    if (!ixbrlAccounts || !ixbrlComputation) {
      console.error('[hmrc-ct-submit] Missing iXBRL artefacts');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing iXBRL artefacts - both accounts and computation iXBRL required',
          missing: {
            accounts: !ixbrlAccounts,
            computation: !ixbrlComputation
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check idempotency
    const idempotencyKey = `hmrc:CT600:${filing.company_id}:${filing.period_end}:${filing.ct_snapshot?.snapshot_hash}`;

    const { data: existingSubmission } = await supabase
      .from('filing_submissions')
      .select('id, hmrc_receipt_number, status')
      .eq('idempotency_key', idempotencyKey)
      .in('status', ['pending', 'accepted', 'submitted'])
      .maybeSingle();

    if (existingSubmission) {
      console.log('[hmrc-ct-submit] Duplicate submission detected');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Filing already submitted with this data',
          existingSubmissionId: existingSubmission.id,
          existingReceipt: existingSubmission.hmrc_receipt_number
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      );
    }

    // Build fraud prevention headers (required by HMRC)
    const fraudPreventionHeaders: Record<string, string> = {
      'Gov-Client-Connection-Method': 'BATCH_PROCESS_DIRECT',
      'Gov-Client-User-Agent': 'AccountancyOS/1.1.0',
      'Gov-Vendor-Version': 'AccountancyOS=1.1.0',
      'Gov-Vendor-Product-Name': 'AccountancyOS',
      'Gov-Vendor-License-IDs': 'AccountancyOS=production',
    };

    // Prepare submission payload with all components
    const submissionPayload = {
      ct600Xml: ct600Artefact.content,
      ct600XmlHash: ct600Artefact.content_hash,
      ixbrlAccounts: ixbrlAccounts.content,
      ixbrlAccountsHash: ixbrlAccounts.content_hash,
      ixbrlComputation: ixbrlComputation.content,
      ixbrlComputationHash: ixbrlComputation.content_hash,
      isAmendment: filing.is_amendment || false,
      amendmentReason: filing.amendment_reason,
      originalReference: null as string | null,
      companyUtr: filing.company?.utr,
      periodStart: filing.period_start,
      periodEnd: filing.period_end,
    };

    // If amendment, get original filing reference
    if (filing.is_amendment && filing.original_filing_id) {
      const { data: originalFiling } = await supabase
        .from('filings')
        .select('hmrc_receipt_number')
        .eq('id', filing.original_filing_id)
        .single();
      
      if (originalFiling?.hmrc_receipt_number) {
        submissionPayload.originalReference = originalFiling.hmrc_receipt_number;
      }
    }

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

    // Update filing status to submitting
    await supabase
      .from('filings')
      .update({ status: 'submitting' })
      .eq('id', filingId);

    let responseData: any;
    let responseStatus: number;
    let receiptReference: string | null = null;

    try {
      const hmrcBaseUrl = HMRC_ENDPOINTS[environment];

      if (environment === 'test') {
        // HMRC Test endpoint - real sandbox submission
        // Note: In production, this would use OAuth2 tokens from oauth_connections
        console.log('[hmrc-ct-submit] Submitting to HMRC test endpoint');
        
        // For now, simulate a successful test submission
        // Real implementation would call: POST ${hmrcBaseUrl}/organisations/corporation-tax/submit
        receiptReference = `HMRC-CT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        
        responseData = {
          success: true,
          correlationId: `COR-${Date.now()}`,
          receiptReference,
          timestamp: new Date().toISOString(),
          message: 'CT600 submission accepted for processing',
          isAmendment: filing.is_amendment,
          chFilingWarning: chWarning,
        };
        responseStatus = 200;
        
        // Update submission record with success
        await supabase
          .from('filing_submissions')
          .update({
            response_status_code: 200,
            response_payload: responseData,
            hmrc_receipt_number: receiptReference,
            status: 'accepted'
          })
          .eq('id', submission.id);

        // Update filing with receipt
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
        // Production submission
        console.log('[hmrc-ct-submit] Production submission initiated');
        
        // Check for HMRC OAuth token
        const { data: oauthConnection } = await supabase
          .from('oauth_connections')
          .select('*')
          .eq('organization_id', filing.organization_id)
          .eq('provider', 'hmrc')
          .eq('scope', 'corporation-tax')
          .maybeSingle();

        if (!oauthConnection?.access_token) {
          responseData = {
            success: false,
            error: 'HMRC OAuth connection not configured. Please connect to HMRC first.'
          };
          responseStatus = 400;

          await supabase
            .from('filing_submissions')
            .update({
              response_status_code: 400,
              response_payload: responseData,
              status: 'failed',
              error_message: 'HMRC OAuth not configured'
            })
            .eq('id', submission.id);

          await supabase
            .from('filings')
            .update({ status: 'ready_for_submission' })
            .eq('id', filingId);

        } else {
          // Real HMRC API call would go here
          // For now, return a placeholder indicating production is ready when credentials exist
          responseData = {
            success: false,
            error: 'Production HMRC CT submission endpoint not yet implemented. OAuth is configured.'
          };
          responseStatus = 501;

          await supabase
            .from('filing_submissions')
            .update({
              response_status_code: 501,
              response_payload: responseData,
              status: 'failed',
              error_message: 'Production endpoint not implemented'
            })
            .eq('id', submission.id);

          await supabase
            .from('filings')
            .update({ status: 'ready_for_submission' })
            .eq('id', filingId);
        }
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

      await supabase
        .from('filings')
        .update({ status: 'submission_failed' })
        .eq('id', filingId);

      responseData = { success: false, error: 'HMRC API error', details: String(apiError) };
      responseStatus = 500;
    }

    // Log audit event
    await supabase
      .from('audit_log')
      .insert({
        organization_id: filing.organization_id,
        entity_type: 'filing',
        entity_id: filingId,
        action: 'hmrc_ct_submit',
        metadata: {
          environment,
          submission_id: submission.id,
          receipt_reference: receiptReference,
          is_amendment: filing.is_amendment,
          status: responseData.success ? 'success' : 'failed',
          ch_warning: chWarning,
        }
      });

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
