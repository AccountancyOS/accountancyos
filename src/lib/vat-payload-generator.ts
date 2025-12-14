// VAT Payload Generator
// Generates deterministic HMRC MTD VAT return payloads from snapshots
// Stores artefacts with hashes for audit trail

import { supabase } from "@/integrations/supabase/client";
import { VATReturnModel, mapWorkpaperToVATModel, buildHMRCVATPayload, validateVATModel } from './vat-model-mapper';

export interface VATPayloadArtifact {
  id: string;
  filing_id: string;
  snapshot_id: string;
  artifact_type: string;
  payload_data: object;
  sha256_hash: string;
  schema_version: string;
  generated_at: string;
}

export interface PayloadGenerationResult {
  success: boolean;
  artifact?: VATPayloadArtifact;
  payload?: object;
  validationErrors?: string[];
  error?: string;
}

const SCHEMA_VERSION = 'HMRC_MTD_VAT_1.0';
const GENERATOR_VERSION = '1.0.0';

/**
 * Compute SHA-256 hash of payload for integrity verification
 */
async function computePayloadHash(payload: object): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload, Object.keys(payload).sort()));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate VAT return payload from filing and snapshot
 * Returns deterministic payload suitable for HMRC submission
 */
export async function generateVATPayload(
  filingId: string,
  snapshotId: string
): Promise<PayloadGenerationResult> {
  try {
    // Fetch the snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from('filing_model_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .single();

    if (snapshotError || !snapshot) {
      return {
        success: false,
        error: `Snapshot not found: ${snapshotError?.message || 'Unknown error'}`,
      };
    }

    // Fetch the filing for context
    const { data: filing, error: filingError } = await supabase
      .from('filings')
      .select('*')
      .eq('id', filingId)
      .single();

    if (filingError || !filing) {
      return {
        success: false,
        error: `Filing not found: ${filingError?.message || 'Unknown error'}`,
      };
    }

    // Extract VAT model from snapshot
    const snapshotData = (snapshot.snapshot_data || {}) as Record<string, any>;
    const filingData = (filing.filing_data || {}) as Record<string, any>;
    const periodKey = snapshotData.period_key || filingData.period_key || '';

    // Map snapshot to VAT return model
    const vatModel = mapWorkpaperToVATModel(snapshotData, periodKey);

    // Validate the model
    const validation = validateVATModel(vatModel);
    if (!validation.valid) {
      return {
        success: false,
        validationErrors: validation.errors,
        error: 'VAT return validation failed',
      };
    }

    // Build HMRC-compliant payload
    const hmrcPayload = buildHMRCVATPayload(vatModel);

    // Compute hash for integrity
    const payloadHash = await computePayloadHash(hmrcPayload);

    // Check if artifact already exists with same hash
    const { data: existingArtifact } = await supabase
      .from('filing_payload_artifacts')
      .select('*')
      .eq('filing_id', filingId)
      .eq('artifact_type', 'vat_return_json')
      .eq('sha256_hash', payloadHash)
      .maybeSingle();

    if (existingArtifact) {
      // Return existing artifact - deterministic generation
      return {
        success: true,
        artifact: {
          id: existingArtifact.id,
          filing_id: existingArtifact.filing_id,
          snapshot_id: existingArtifact.snapshot_id || '',
          artifact_type: existingArtifact.artifact_type,
          payload_data: existingArtifact.payload_data as object,
          sha256_hash: existingArtifact.sha256_hash,
          schema_version: existingArtifact.schema_version,
          generated_at: existingArtifact.generated_at,
        },
        payload: hmrcPayload,
      };
    }

    // Store new artifact
    const { data: newArtifact, error: artifactError } = await supabase
      .from('filing_payload_artifacts')
      .insert({
        filing_id: filingId,
        organization_id: filing.organization_id,
        snapshot_id: snapshotId,
        artifact_type: 'vat_return_json',
        content_type: 'application/json',
        payload_data: hmrcPayload as any,
        sha256_hash: payloadHash,
        generator_version: GENERATOR_VERSION,
        schema_version: SCHEMA_VERSION,
      } as any)
      .select('*')
      .single();

    if (artifactError) {
      return {
        success: false,
        error: `Failed to store payload artifact: ${artifactError.message}`,
      };
    }

    return {
      success: true,
      artifact: {
        id: newArtifact.id,
        filing_id: newArtifact.filing_id,
        snapshot_id: newArtifact.snapshot_id || '',
        artifact_type: newArtifact.artifact_type,
        payload_data: newArtifact.payload_data as object,
        sha256_hash: newArtifact.sha256_hash,
        schema_version: newArtifact.schema_version,
        generated_at: newArtifact.generated_at,
      },
      payload: hmrcPayload,
    };
  } catch (error: any) {
    console.error('Error generating VAT payload:', error);
    return {
      success: false,
      error: error.message || 'Unknown error generating payload',
    };
  }
}

/**
 * Retrieve existing payload artifact for a filing
 */
export async function getPayloadArtifact(
  filingId: string,
  artifactType: string = 'vat_return_json'
): Promise<VATPayloadArtifact | null> {
  const { data, error } = await supabase
    .from('filing_payload_artifacts')
    .select('*')
    .eq('filing_id', filingId)
    .eq('artifact_type', artifactType)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    filing_id: data.filing_id,
    snapshot_id: data.snapshot_id || '',
    artifact_type: data.artifact_type,
    payload_data: data.payload_data as object,
    sha256_hash: data.sha256_hash,
    schema_version: data.schema_version,
    generated_at: data.generated_at,
  };
}

/**
 * Verify payload integrity against stored hash
 */
export async function verifyPayloadIntegrity(artifact: VATPayloadArtifact): Promise<boolean> {
  const computedHash = await computePayloadHash(artifact.payload_data);
  return computedHash === artifact.sha256_hash;
}
