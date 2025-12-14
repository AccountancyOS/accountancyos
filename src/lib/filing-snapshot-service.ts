// Filing Model Snapshot Service
// Creates and manages immutable snapshots for filings

import { supabase } from "@/integrations/supabase/client";

export type SnapshotType = 
  | 'cs01' 
  | 'accounts_frs105' 
  | 'accounts_frs102_1a' 
  | 'vat_return' 
  | 'ct600' 
  | 'sa100';

export interface SnapshotData {
  [key: string]: unknown;
}

export interface FilingModelSnapshot {
  id: string;
  organization_id: string;
  company_id: string | null;
  client_id: string | null;
  snapshot_type: SnapshotType;
  period_start: string;
  period_end: string;
  snapshot_data: SnapshotData;
  snapshot_hash: string;
  source_workpaper_id: string | null;
  source_ledger_version: string | null;
  approved_by: string | null;
  approved_at: string;
  generator_version: string;
  created_at: string;
}

export interface CreateSnapshotParams {
  organizationId: string;
  companyId?: string;
  clientId?: string;
  snapshotType: SnapshotType;
  periodStart: string;
  periodEnd: string;
  snapshotData: SnapshotData;
  sourceWorkpaperId?: string;
  sourceLedgerVersion?: string;
  approvedBy?: string;
}

export interface CreateSnapshotResult {
  success: boolean;
  snapshot?: FilingModelSnapshot;
  snapshotHash?: string;
  error?: string;
}

/**
 * Compute SHA256 hash of snapshot data for integrity verification
 */
export async function computeSnapshotHash(data: SnapshotData): Promise<string> {
  const encoder = new TextEncoder();
  const dataString = JSON.stringify(data, Object.keys(data).sort());
  const dataBuffer = encoder.encode(dataString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate idempotency key for a filing
 */
export function generateIdempotencyKey(params: {
  organizationId: string;
  provider: string;
  filingType: string;
  companyId?: string;
  clientId?: string;
  periodStart: string;
  periodEnd: string;
  snapshotHash: string;
}): string {
  const parts = [
    params.organizationId,
    params.provider,
    params.filingType,
    params.companyId || params.clientId || 'no-entity',
    params.periodStart,
    params.periodEnd,
    params.snapshotHash,
  ];
  return parts.join('::');
}

/**
 * Create an immutable snapshot from workpaper or model data
 */
export async function createSnapshot(params: CreateSnapshotParams): Promise<CreateSnapshotResult> {
  try {
    const snapshotHash = await computeSnapshotHash(params.snapshotData);
    
    // Check if identical snapshot already exists (same hash)
    const { data: existing } = await supabase
      .from('filing_model_snapshots')
      .select('id, snapshot_hash')
      .eq('organization_id', params.organizationId)
      .eq('snapshot_hash', snapshotHash)
      .maybeSingle();
    
    if (existing) {
      // Return existing snapshot - no need to duplicate
      const { data: snapshot } = await supabase
        .from('filing_model_snapshots')
        .select('*')
        .eq('id', existing.id)
        .single();
      
      return {
        success: true,
        snapshot: snapshot as unknown as FilingModelSnapshot,
        snapshotHash,
      };
    }
    
    // Create new snapshot - use type assertion for insert
    const insertData = {
      organization_id: params.organizationId,
      company_id: params.companyId || null,
      client_id: params.clientId || null,
      snapshot_type: params.snapshotType,
      period_start: params.periodStart,
      period_end: params.periodEnd,
      snapshot_data: params.snapshotData as unknown as Record<string, unknown>,
      snapshot_hash: snapshotHash,
      source_workpaper_id: params.sourceWorkpaperId || null,
      source_ledger_version: params.sourceLedgerVersion || null,
      approved_by: params.approvedBy || null,
      generator_version: '1.0.0',
    };
    
    const { data: snapshot, error } = await supabase
      .from('filing_model_snapshots')
      .insert(insertData as any)
      .select('*')
      .single();
    
    if (error) {
      console.error('Failed to create snapshot:', error);
      return { success: false, error: error.message };
    }
    
    return {
      success: true,
      snapshot: snapshot as unknown as FilingModelSnapshot,
      snapshotHash,
    };
  } catch (err: any) {
    console.error('Snapshot creation error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get a snapshot by ID
 */
export async function getSnapshot(snapshotId: string): Promise<FilingModelSnapshot | null> {
  const { data, error } = await supabase
    .from('filing_model_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .single();
  
  if (error || !data) {
    console.error('Failed to fetch snapshot:', error);
    return null;
  }
  
  return data as unknown as FilingModelSnapshot;
}

/**
 * Validate snapshot integrity by recomputing hash
 */
export async function validateSnapshotIntegrity(snapshotId: string): Promise<{
  valid: boolean;
  computedHash?: string;
  storedHash?: string;
  error?: string;
}> {
  const snapshot = await getSnapshot(snapshotId);
  
  if (!snapshot) {
    return { valid: false, error: 'Snapshot not found' };
  }
  
  const computedHash = await computeSnapshotHash(snapshot.snapshot_data);
  const valid = computedHash === snapshot.snapshot_hash;
  
  return {
    valid,
    computedHash,
    storedHash: snapshot.snapshot_hash,
    error: valid ? undefined : 'Hash mismatch - snapshot data may have been corrupted',
  };
}

/**
 * Create snapshot from finalized workpaper
 */
export async function createSnapshotFromWorkpaper(
  workpaperId: string,
  userId: string
): Promise<CreateSnapshotResult> {
  // Fetch workpaper with all related data
  const { data: workpaper, error } = await supabase
    .from('workpaper_instances')
    .select(`
      *,
      companies(id, company_number, company_name),
      clients(id, first_name, last_name)
    `)
    .eq('id', workpaperId)
    .single();
  
  if (error || !workpaper) {
    return { success: false, error: 'Workpaper not found' };
  }
  
  if (workpaper.status !== 'finalised') {
    return { success: false, error: 'Workpaper must be finalised before creating snapshot' };
  }
  
  // Determine snapshot type from service_type (workpaper_type may not exist)
  const serviceType = workpaper.service_type || '';
  const snapshotTypeMap: Record<string, SnapshotType> = {
    'accounts_frs105': 'accounts_frs105',
    'accounts_frs102_1a': 'accounts_frs102_1a',
    'vat_return': 'vat_return',
    'VAT': 'vat_return',
    'ct600': 'ct600',
    'CT600': 'ct600',
    'sa100': 'sa100',
    'SA100': 'sa100',
    'CS01': 'cs01',
    'confirmation_statement': 'cs01',
  };
  
  const snapshotType = snapshotTypeMap[serviceType] || 'accounts_frs105';
  
  // Build snapshot data from workpaper
  const snapshotData: SnapshotData = {
    workpaper_id: workpaper.id,
    service_type: workpaper.service_type,
    field_values: workpaper.field_values || {},
    field_overrides: workpaper.field_overrides || {},
    computed_data: workpaper.computed_data || {},
    finalized_at: workpaper.finalised_at,
    finalized_by: workpaper.finalised_by,
  };
  
  return createSnapshot({
    organizationId: workpaper.organization_id,
    companyId: workpaper.company_id,
    clientId: workpaper.client_id,
    snapshotType,
    periodStart: workpaper.period_start,
    periodEnd: workpaper.period_end,
    snapshotData,
    sourceWorkpaperId: workpaper.id,
    approvedBy: userId,
  });
}

/**
 * Check if a filing with identical snapshot already exists (idempotency check)
 */
export async function checkFilingIdempotency(
  idempotencyKey: string
): Promise<{ exists: boolean; filingId?: string }> {
  const { data } = await supabase
    .from('filings')
    .select('id, status')
    .eq('idempotency_key', idempotencyKey)
    .not('status', 'in', '("cancelled","rejected")')
    .maybeSingle();
  
  return {
    exists: !!data,
    filingId: data?.id,
  };
}

/**
 * Link a snapshot to a filing with idempotency key
 */
export async function linkSnapshotToFiling(
  filingId: string,
  snapshotId: string,
  idempotencyKey: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('filings')
    .update({
      model_snapshot_id: snapshotId,
      idempotency_key: idempotencyKey,
    })
    .eq('id', filingId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true };
}
