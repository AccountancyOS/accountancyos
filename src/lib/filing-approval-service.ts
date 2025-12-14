import { supabase } from "@/integrations/supabase/client";

export type ApprovalScope = 'ACCOUNTS' | 'CT600';
export type ApprovalRole = 'CLIENT' | 'ACCOUNTANT';
export type ApprovalMethod = 'PORTAL' | 'EMAIL' | 'OVERRIDE';

export interface FilingApproval {
  id: string;
  organization_id: string;
  filing_id: string;
  approval_scope: ApprovalScope;
  model_snapshot_id: string;
  approved_by_role: ApprovalRole;
  approval_method: ApprovalMethod;
  approval_reason?: string;
  approved_by?: string;
  approved_at: string;
  revoked_at?: string;
  revoked_by?: string;
  revocation_reason?: string;
  snapshot_hash: string;
  created_at: string;
}

export interface ApprovalRequest {
  filingId: string;
  scope: ApprovalScope;
  snapshotId: string;
  snapshotHash: string;
  role: ApprovalRole;
  method: ApprovalMethod;
  reason?: string;
}

export interface ApprovalResult {
  success: boolean;
  approvalId?: string;
  error?: string;
}

/**
 * Create a filing approval record
 */
export async function createFilingApproval(
  request: ApprovalRequest
): Promise<ApprovalResult> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get filing to verify access
  const { data: filing, error: filingError } = await supabase
    .from('filings')
    .select('organization_id')
    .eq('id', request.filingId)
    .maybeSingle();

  if (filingError || !filing) {
    return { success: false, error: 'Filing not found' };
  }

  // Check for existing active approval
  const { data: existing } = await supabase
    .from('filing_approvals')
    .select('id')
    .eq('filing_id', request.filingId)
    .eq('approval_scope', request.scope)
    .is('revoked_at', null)
    .maybeSingle();

  if (existing) {
    return { success: false, error: 'Active approval already exists for this scope' };
  }

  // Create approval
  const { data: approval, error } = await supabase
    .from('filing_approvals')
    .insert({
      organization_id: filing.organization_id,
      filing_id: request.filingId,
      approval_scope: request.scope,
      model_snapshot_id: request.snapshotId,
      approved_by_role: request.role,
      approval_method: request.method,
      approval_reason: request.reason,
      approved_by: userData.user.id,
      snapshot_hash: request.snapshotHash
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating filing approval:', error);
    return { success: false, error: error.message };
  }

  // Update filing with approval reference
  const updateField = request.scope === 'ACCOUNTS' 
    ? { accounts_approval_id: approval.id }
    : { ct_approval_id: approval.id };

  await supabase
    .from('filings')
    .update({ ...updateField, status: 'approved' })
    .eq('id', request.filingId);

  return { success: true, approvalId: approval.id };
}

/**
 * Revoke a filing approval
 */
export async function revokeFilingApproval(
  approvalId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { error } = await supabase
    .from('filing_approvals')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: userData.user.id,
      revocation_reason: reason
    })
    .eq('id', approvalId)
    .is('revoked_at', null);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Get active approval for a filing and scope
 */
export async function getActiveApproval(
  filingId: string,
  scope: ApprovalScope
): Promise<FilingApproval | null> {
  const { data, error } = await supabase
    .from('filing_approvals')
    .select('*')
    .eq('filing_id', filingId)
    .eq('approval_scope', scope)
    .is('revoked_at', null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as FilingApproval;
}

/**
 * Validate that a filing can be submitted
 */
export async function validateFilingForSubmission(
  filingId: string,
  filingType: 'ACCOUNTS_CH' | 'CT600_HMRC'
): Promise<{ valid: boolean; errors: string[]; approvalId?: string }> {
  const { data, error } = await supabase.rpc('validate_filing_submission', {
    p_filing_id: filingId,
    p_filing_type: filingType,
    p_user_id: (await supabase.auth.getUser()).data.user?.id
  });

  if (error) {
    return { valid: false, errors: [error.message] };
  }

  const result = data as { valid: boolean; errors: string[]; approval_id?: string } | null;
  return {
    valid: result?.valid ?? false,
    errors: result?.errors || [],
    approvalId: result?.approval_id
  };
}

/**
 * Queue a filing for submission
 */
export async function queueFilingForSubmission(
  filingId: string,
  filingType: 'ACCOUNTS_CH' | 'CT600_HMRC'
): Promise<{ success: boolean; queueId?: string; error?: string }> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data, error } = await supabase.rpc('queue_filing_for_submission', {
    p_filing_id: filingId,
    p_filing_type: filingType,
    p_user_id: userData.user.id
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as { valid: boolean; errors?: string[]; queue_id?: string } | null;
  if (!result?.valid) {
    return { success: false, error: result?.errors?.[0] || 'Validation failed' };
  }

  return { success: true, queueId: result.queue_id };
}

/**
 * Check if accounts approval exists and is valid
 */
export async function checkAccountsApprovalStatus(
  filingId: string
): Promise<{ approved: boolean; approval?: FilingApproval }> {
  const approval = await getActiveApproval(filingId, 'ACCOUNTS');
  return { approved: !!approval, approval: approval || undefined };
}

/**
 * Check if CT approval exists and is valid
 */
export async function checkCTApprovalStatus(
  filingId: string
): Promise<{ approved: boolean; approval?: FilingApproval }> {
  const approval = await getActiveApproval(filingId, 'CT600');
  return { approved: !!approval, approval: approval || undefined };
}
