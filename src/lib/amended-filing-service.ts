import { supabase } from "@/integrations/supabase/client";

export type AmendmentType = 'ACCOUNTS' | 'CT600';

export interface AmendmentRequest {
  originalFilingId: string;
  amendmentReason: string;
  filingType: AmendmentType;
}

export interface AmendmentResult {
  success: boolean;
  amendedFilingId?: string;
  error?: string;
}

/**
 * Create an amended filing based on original filing
 * Copies relevant data and marks as amendment
 */
export async function createAmendedFiling(
  request: AmendmentRequest
): Promise<AmendmentResult> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get original filing
  const { data: original, error: fetchError } = await supabase
    .from('filings')
    .select('*')
    .eq('id', request.originalFilingId)
    .single();

  if (fetchError || !original) {
    return { success: false, error: 'Original filing not found' };
  }

  // Verify original is in a submitted/accepted state
  if (!['submitted', 'accepted', 'filed'].includes(original.status)) {
    return { 
      success: false, 
      error: 'Can only amend filings that have been submitted or accepted' 
    };
  }

  // Create amended filing
  const { data: amended, error: createError } = await supabase
    .from('filings')
    .insert([{
      organization_id: original.organization_id,
      company_id: original.company_id,
      client_id: original.client_id,
      job_id: original.job_id,
      filing_type: original.filing_type,
      filing_body: original.filing_body,
      period_start: original.period_start,
      period_end: original.period_end,
      status: 'draft',
      is_amendment: true,
      original_filing_id: request.originalFilingId,
      amendment_reason: request.amendmentReason,
      accounts_snapshot_id: original.accounts_snapshot_id,
      ct_snapshot_id: original.ct_snapshot_id,
      filing_data: original.filing_data,
      environment: original.environment
    }])
    .select('id')
    .single();

  if (createError || !amended) {
    console.error('Error creating amended filing:', createError);
    return { success: false, error: createError?.message || 'Failed to create amendment' };
  }

  // Log audit entry
  await supabase.from('audit_log').insert([{
    organization_id: original.organization_id,
    entity_type: 'filing',
    entity_id: amended.id,
    action: 'amendment_created',
    user_id: userData.user.id,
    metadata: {
      original_filing_id: request.originalFilingId,
      amendment_reason: request.amendmentReason,
      filing_type: request.filingType
    }
  }]);

  return { success: true, amendedFilingId: amended.id };
}

/**
 * Get amendment history for a filing
 */
export async function getFilingAmendmentHistory(
  filingId: string
): Promise<{ amendments: any[]; original?: any }> {
  // Get the filing to check if it's an amendment or original
  const { data: filing } = await supabase
    .from('filings')
    .select('*, original_filing:original_filing_id(*)')
    .eq('id', filingId)
    .maybeSingle();

  if (!filing) {
    return { amendments: [] };
  }

  // Find the root filing
  let rootFilingId = filingId;
  if (filing.is_amendment && filing.original_filing_id) {
    rootFilingId = filing.original_filing_id;
  }

  // Get all amendments for the root filing
  const { data: amendments } = await supabase
    .from('filings')
    .select(`
      id,
      status,
      is_amendment,
      amendment_reason,
      created_at,
      submitted_at,
      hmrc_receipt_number,
      ch_transaction_id
    `)
    .eq('original_filing_id', rootFilingId)
    .order('created_at', { ascending: true });

  // Get original filing
  const { data: original } = await supabase
    .from('filings')
    .select(`
      id,
      status,
      created_at,
      submitted_at,
      hmrc_receipt_number,
      ch_transaction_id
    `)
    .eq('id', rootFilingId)
    .maybeSingle();

  return {
    amendments: amendments || [],
    original: original || undefined
  };
}

/**
 * Check if filing can be amended
 */
export async function canFilingBeAmended(
  filingId: string
): Promise<{ canAmend: boolean; reason?: string }> {
  const { data: filing } = await supabase
    .from('filings')
    .select('status, is_amendment, period_end')
    .eq('id', filingId)
    .maybeSingle();

  if (!filing) {
    return { canAmend: false, reason: 'Filing not found' };
  }

  // Can only amend submitted/accepted filings
  if (!['submitted', 'accepted', 'filed'].includes(filing.status)) {
    return { 
      canAmend: false, 
      reason: 'Only filed returns can be amended' 
    };
  }

  // Check if within HMRC amendment window (usually 12 months from filing deadline)
  // For simplicity, we allow amendments within 2 years of period end
  const periodEnd = new Date(filing.period_end);
  const twoYearsAfter = new Date(periodEnd);
  twoYearsAfter.setFullYear(twoYearsAfter.getFullYear() + 2);

  if (new Date() > twoYearsAfter) {
    return { 
      canAmend: false, 
      reason: 'Amendment window has closed (2 years from period end)' 
    };
  }

  return { canAmend: true };
}

/**
 * Get all pending amendments for an organization
 */
export async function getPendingAmendments(
  organizationId: string
): Promise<any[]> {
  const { data, error } = await supabase
    .from('filings')
    .select(`
      id,
      filing_type,
      period_start,
      period_end,
      status,
      amendment_reason,
      created_at,
      company:company_id(company_name, company_number),
      original_filing:original_filing_id(id, status, submitted_at)
    `)
    .eq('organization_id', organizationId)
    .eq('is_amendment', true)
    .in('status', ['draft', 'ready_for_review', 'awaiting_approval', 'approved'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending amendments:', error);
    return [];
  }

  return data || [];
}
