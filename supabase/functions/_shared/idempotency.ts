/**
 * Idempotency helpers for edge functions
 * Prevents duplicate side effects from retried requests
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { logInfo, logError } from './logging.ts';
import { AuthError } from './auth.ts';
import { ErrorCodes } from './responses.ts';

export interface IdempotencyRecord {
  id: string;
  organization_id: string;
  scope: string;
  key: string;
  status: 'in_progress' | 'succeeded' | 'failed';
  response_json: unknown;
  error_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface BeginIdempotentResult {
  /** True if this is a replay of a previous request */
  replay: boolean;
  /** The response from the previous request (if replay) */
  responseJson?: unknown;
  /** The record ID (if new) */
  recordId?: string;
}

export interface BeginIdempotentOptions {
  orgId: string;
  scope: string;
  key: string;
  traceId: string;
}

/**
 * Begin an idempotent operation
 * Returns existing result if already succeeded, throws if in progress
 */
export async function beginIdempotent(
  adminClient: SupabaseClient,
  options: BeginIdempotentOptions
): Promise<BeginIdempotentResult> {
  const { orgId, scope, key, traceId } = options;
  
  if (!key) {
    // No idempotency key provided, proceed without idempotency
    logInfo(traceId, 'No idempotency key provided, proceeding without idempotency', {
      scope,
      orgId,
    });
    return { replay: false };
  }
  
  // Check for existing record
  const { data: existing, error: fetchError } = await adminClient
    .from('idempotency_keys')
    .select('*')
    .eq('organization_id', orgId)
    .eq('scope', scope)
    .eq('key', key)
    .maybeSingle();
  
  if (fetchError) {
    logError(traceId, fetchError, { scope, key });
    throw new Error('Failed to check idempotency key');
  }
  
  if (existing) {
    const record = existing as IdempotencyRecord;
    
    if (record.status === 'succeeded') {
      logInfo(traceId, 'Idempotent replay - returning cached success', {
        scope,
        key,
        recordId: record.id,
      });
      return {
        replay: true,
        responseJson: record.response_json,
      };
    }
    
    if (record.status === 'in_progress') {
      // Check if it's stale (older than 5 minutes)
      const createdAt = new Date(record.created_at);
      const staleThreshold = 5 * 60 * 1000; // 5 minutes
      
      if (Date.now() - createdAt.getTime() > staleThreshold) {
        // Stale in-progress record, take it over
        logInfo(traceId, 'Taking over stale in_progress idempotency record', {
          scope,
          key,
          recordId: record.id,
        });
        
        const { error: updateError } = await adminClient
          .from('idempotency_keys')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', record.id);
        
        if (updateError) {
          logError(traceId, updateError, { scope, key });
        }
        
        return { replay: false, recordId: record.id };
      }
      
      logInfo(traceId, 'Idempotent operation already in progress', {
        scope,
        key,
        recordId: record.id,
      });
      
      throw new AuthError(
        ErrorCodes.IDEMPOTENCY_IN_PROGRESS,
        'This operation is already in progress. Please wait and retry.',
        409
      );
    }
    
    if (record.status === 'failed') {
      // Previous attempt failed, allow retry by updating to in_progress
      logInfo(traceId, 'Retrying previously failed idempotent operation', {
        scope,
        key,
        recordId: record.id,
      });
      
      const { error: updateError } = await adminClient
        .from('idempotency_keys')
        .update({
          status: 'in_progress',
          response_json: null,
          error_json: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id);
      
      if (updateError) {
        logError(traceId, updateError, { scope, key });
        throw new Error('Failed to update idempotency key for retry');
      }
      
      return { replay: false, recordId: record.id };
    }
  }
  
  // Create new idempotency record
  const { data: newRecord, error: insertError } = await adminClient
    .from('idempotency_keys')
    .insert({
      organization_id: orgId,
      scope,
      key,
      status: 'in_progress',
    })
    .select('id')
    .single();
  
  if (insertError) {
    // Could be a race condition - another request created it first
    if (insertError.code === '23505') { // Unique violation
      logInfo(traceId, 'Race condition on idempotency key creation, retrying lookup', {
        scope,
        key,
      });
      // Recursive retry - will find the existing record
      return beginIdempotent(adminClient, options);
    }
    
    logError(traceId, insertError, { scope, key });
    throw new Error('Failed to create idempotency key');
  }
  
  logInfo(traceId, 'Created new idempotency record', {
    scope,
    key,
    recordId: newRecord.id,
  });
  
  return { replay: false, recordId: newRecord.id };
}

/**
 * Mark idempotent operation as succeeded
 */
export async function finishIdempotentSuccess(
  adminClient: SupabaseClient,
  options: {
    orgId: string;
    scope: string;
    key: string;
    responseJson: unknown;
    traceId: string;
  }
): Promise<void> {
  const { orgId, scope, key, responseJson, traceId } = options;
  
  if (!key) return; // No idempotency key, nothing to update
  
  const { error } = await adminClient
    .from('idempotency_keys')
    .update({
      status: 'succeeded',
      response_json: responseJson,
      error_json: null,
    })
    .eq('organization_id', orgId)
    .eq('scope', scope)
    .eq('key', key);
  
  if (error) {
    logError(traceId, error, { scope, key });
    // Don't throw - the operation succeeded, we just failed to record it
  } else {
    logInfo(traceId, 'Marked idempotent operation as succeeded', { scope, key });
  }
}

/**
 * Mark idempotent operation as failed
 */
export async function finishIdempotentFailure(
  adminClient: SupabaseClient,
  options: {
    orgId: string;
    scope: string;
    key: string;
    errorJson: unknown;
    traceId: string;
  }
): Promise<void> {
  const { orgId, scope, key, errorJson, traceId } = options;
  
  if (!key) return; // No idempotency key, nothing to update
  
  const { error } = await adminClient
    .from('idempotency_keys')
    .update({
      status: 'failed',
      response_json: null,
      error_json: errorJson,
    })
    .eq('organization_id', orgId)
    .eq('scope', scope)
    .eq('key', key);
  
  if (error) {
    logError(traceId, error, { scope, key });
  } else {
    logInfo(traceId, 'Marked idempotent operation as failed', { scope, key });
  }
}
