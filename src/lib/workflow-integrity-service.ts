// Workflow Integrity Service
// Handles snapshot dependency validation and approval revocation

import { supabase } from "@/integrations/supabase/client";

export type RevocationReason = 
  | 'UNDERLYING_ACCOUNTS_CHANGED'
  | 'CT_COMPUTATION_CHANGED'
  | 'MANUAL_REVOCATION'
  | 'SNAPSHOT_SUPERSEDED'
  | 'FILING_AMENDED'
  | 'ENTITY_DATA_CHANGED';

export interface SubmissionValidationResult {
  valid: boolean;
  errors: string[];
  approvalId?: string;
  snapshotId?: string;
  snapshotHash?: string;
}

export interface RevocationLogEntry {
  id: string;
  organization_id: string;
  approval_id: string;
  filing_id: string;
  approval_scope: 'ACCOUNTS' | 'CT600';
  old_snapshot_id?: string;
  old_snapshot_hash?: string;
  new_snapshot_id?: string;
  new_snapshot_hash?: string;
  revocation_reason: RevocationReason;
  system_actor: string;
  revoked_at: string;
  metadata: Record<string, unknown>;
}

/**
 * Validate filing submission integrity server-side
 * Ensures approval exists, matches current snapshot, and snapshot is not superseded
 */
export async function validateSubmissionIntegrity(
  filingId: string,
  filingType: 'ACCOUNTS_CH' | 'CT600_HMRC'
): Promise<SubmissionValidationResult> {
  const { data, error } = await supabase.rpc('validate_submission_integrity', {
    p_filing_id: filingId,
    p_filing_type: filingType
  });

  if (error) {
    console.error('Submission validation error:', error);
    return {
      valid: false,
      errors: [error.message]
    };
  }

  const result = data as {
    valid: boolean;
    errors: string[];
    approval_id?: string;
    snapshot_id?: string;
    snapshot_hash?: string;
  } | null;

  return {
    valid: result?.valid ?? false,
    errors: result?.errors || [],
    approvalId: result?.approval_id,
    snapshotId: result?.snapshot_id,
    snapshotHash: result?.snapshot_hash
  };
}

/**
 * Get revocation history for a filing
 */
export async function getRevocationHistory(
  filingId: string
): Promise<RevocationLogEntry[]> {
  const { data, error } = await supabase
    .from('approval_revocation_log')
    .select('*')
    .eq('filing_id', filingId)
    .order('revoked_at', { ascending: false });

  if (error) {
    console.error('Error fetching revocation history:', error);
    return [];
  }

  return (data || []) as RevocationLogEntry[];
}

/**
 * Check if a filing's approval is still valid (not revoked, matches snapshot)
 */
export async function checkApprovalValidity(
  filingId: string,
  scope: 'ACCOUNTS' | 'CT600'
): Promise<{
  valid: boolean;
  approval?: {
    id: string;
    snapshotId: string;
    snapshotHash: string;
    approvedAt: string;
  };
  reason?: string;
}> {
  // Get active approval
  const { data: approval, error: approvalError } = await supabase
    .from('filing_approvals')
    .select('*')
    .eq('filing_id', filingId)
    .eq('approval_scope', scope)
    .is('revoked_at', null)
    .maybeSingle();

  if (approvalError) {
    return { valid: false, reason: 'Error checking approval' };
  }

  if (!approval) {
    return { valid: false, reason: 'No active approval exists' };
  }

  // Get filing with snapshot
  const { data: filing, error: filingError } = await supabase
    .from('filings')
    .select('accounts_snapshot_id, ct_snapshot_id')
    .eq('id', filingId)
    .single();

  if (filingError || !filing) {
    return { valid: false, reason: 'Filing not found' };
  }

  // Determine which snapshot to check
  const snapshotId = scope === 'ACCOUNTS' 
    ? filing.accounts_snapshot_id 
    : filing.ct_snapshot_id;

  if (!snapshotId) {
    return { valid: false, reason: 'No snapshot linked to filing' };
  }

  // Check snapshot hash matches
  if (approval.model_snapshot_id !== snapshotId) {
    return { valid: false, reason: 'Approval is for different snapshot' };
  }

  // Get current snapshot hash
  const snapshotTable = scope === 'ACCOUNTS' 
    ? 'accounts_model_snapshots' 
    : 'ct_computation_snapshots';
  
  const { data: snapshot } = await supabase
    .from(snapshotTable)
    .select('snapshot_hash')
    .eq('id', snapshotId)
    .single();

  if (snapshot && approval.snapshot_hash !== snapshot.snapshot_hash) {
    return { valid: false, reason: 'Snapshot data has changed since approval' };
  }

  return {
    valid: true,
    approval: {
      id: approval.id,
      snapshotId: approval.model_snapshot_id,
      snapshotHash: approval.snapshot_hash,
      approvedAt: approval.approved_at
    }
  };
}

/**
 * Manually revoke an approval with audit trail
 */
export async function revokeApprovalManually(
  approvalId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get approval details first
  const { data: approval } = await supabase
    .from('filing_approvals')
    .select('*, filings(organization_id)')
    .eq('id', approvalId)
    .is('revoked_at', null)
    .single();

  if (!approval) {
    return { success: false, error: 'Approval not found or already revoked' };
  }

  // Revoke the approval
  const { error: updateError } = await supabase
    .from('filing_approvals')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: userData.user.id,
      revocation_reason: reason
    })
    .eq('id', approvalId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Log the manual revocation
  const { error: logError } = await supabase
    .from('approval_revocation_log')
    .insert({
      organization_id: (approval.filings as any)?.organization_id,
      approval_id: approvalId,
      filing_id: approval.filing_id,
      approval_scope: approval.approval_scope,
      old_snapshot_id: approval.model_snapshot_id,
      old_snapshot_hash: approval.snapshot_hash,
      revocation_reason: 'MANUAL_REVOCATION',
      system_actor: 'USER',
      metadata: { 
        revoked_by: userData.user.id,
        reason: reason
      }
    });

  if (logError) {
    console.error('Error logging revocation:', logError);
    // Don't fail the operation, just log
  }

  // Regress filing status
  await supabase
    .from('filings')
    .update({ status: 'ready_for_approval' })
    .eq('id', approval.filing_id)
    .not('status', 'in', '("filed","accepted","submitted")');

  return { success: true };
}

/**
 * Check if a newer snapshot exists (superseded check)
 */
export async function checkSnapshotSuperseded(
  snapshotId: string,
  snapshotType: 'accounts' | 'ct',
  companyId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ superseded: boolean; newerSnapshotId?: string }> {
  const table = snapshotType === 'accounts' 
    ? 'accounts_model_snapshots' 
    : 'ct_computation_snapshots';

  // Get current snapshot's created_at
  const { data: currentSnapshot } = await supabase
    .from(table)
    .select('created_at')
    .eq('id', snapshotId)
    .single();

  if (!currentSnapshot) {
    return { superseded: false };
  }

  // Check for newer snapshot
  const { data: newerSnapshots } = await supabase
    .from(table)
    .select('id, created_at')
    .eq('company_id', companyId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .gt('created_at', currentSnapshot.created_at)
    .order('created_at', { ascending: false })
    .limit(1);

  if (newerSnapshots && newerSnapshots.length > 0) {
    return {
      superseded: true,
      newerSnapshotId: newerSnapshots[0].id
    };
  }

  return { superseded: false };
}

/**
 * Pre-submission check combining all validation
 */
export async function performPreSubmissionCheck(
  filingId: string,
  filingType: 'ACCOUNTS_CH' | 'CT600_HMRC'
): Promise<{
  canSubmit: boolean;
  errors: string[];
  warnings: string[];
  approvalDetails?: {
    approvalId: string;
    snapshotId: string;
    snapshotHash: string;
  };
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Server-side integrity validation
  const integrityResult = await validateSubmissionIntegrity(filingId, filingType);
  
  if (!integrityResult.valid) {
    errors.push(...integrityResult.errors);
  }

  // 2. Get filing details for additional checks
  const { data: filing } = await supabase
    .from('filings')
    .select('*, companies(company_number, company_name)')
    .eq('id', filingId)
    .single();

  if (!filing) {
    errors.push('Filing not found');
    return { canSubmit: false, errors, warnings };
  }

  // 3. For CT600, check CH filing status (warn-only)
  if (filingType === 'CT600_HMRC' && filing.company_id) {
    const { data: chFiling } = await supabase
      .from('filings')
      .select('status')
      .eq('company_id', filing.company_id)
      .eq('filing_type', 'companies_house_accounts')
      .eq('period_end', filing.period_end)
      .maybeSingle();

    if (!chFiling || chFiling.status !== 'filed') {
      warnings.push('Companies House accounts filing is pending or not filed');
    }
  }

  // 4. Check for superseded snapshot
  const scope = filingType === 'ACCOUNTS_CH' ? 'accounts' : 'ct';
  const snapshotId = scope === 'accounts' 
    ? filing.accounts_snapshot_id 
    : filing.ct_snapshot_id;

  if (snapshotId && filing.company_id) {
    const supersededCheck = await checkSnapshotSuperseded(
      snapshotId,
      scope,
      filing.company_id,
      filing.period_start,
      filing.period_end
    );

    if (supersededCheck.superseded) {
      errors.push('A newer snapshot exists - current snapshot is superseded');
    }
  }

  return {
    canSubmit: errors.length === 0,
    errors,
    warnings,
    approvalDetails: integrityResult.valid ? {
      approvalId: integrityResult.approvalId!,
      snapshotId: integrityResult.snapshotId!,
      snapshotHash: integrityResult.snapshotHash!
    } : undefined
  };
}
