/**
 * HMRC Token Management
 * Handles OAuth token refresh and validation
 */

import { SupabaseClient } from '@supabase/supabase-js-257';
import { logInfo, logError, logWarn } from './logging.ts';

const HMRC_AUTH_URL = Deno.env.get('HMRC_AUTH_URL') || 'https://test-api.service.hmrc.gov.uk';
const HMRC_CLIENT_ID = Deno.env.get('HMRC_CLIENT_ID');
const HMRC_CLIENT_SECRET = Deno.env.get('HMRC_CLIENT_SECRET');
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY') || 'default-dev-key-change-in-production';

// Token buffer - refresh if expiring within this many seconds
const TOKEN_EXPIRY_BUFFER_SECONDS = 120;

export interface HmrcTokenResult {
  accessToken: string;
  expiresAt: Date;
}

/**
 * Decrypt a value encrypted with Web Crypto AES-GCM
 */
async function decryptValue(encryptedBase64: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    ciphertext
  );
  
  return decoder.decode(decryptedBuffer);
}

/**
 * Encrypt a value using Web Crypto AES-GCM
 */
async function encryptValue(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    data
  );
  
  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedBuffer), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

/**
 * Get a valid HMRC access token, refreshing if necessary
 */
export async function getValidHmrcAccessToken(
  adminClient: SupabaseClient,
  options: { orgId: string; traceId: string }
): Promise<HmrcTokenResult> {
  const { orgId, traceId } = options;
  
  // Fetch stored HMRC credentials
  const { data: hmrcIntegration, error: fetchError } = await adminClient
    .from('organization_integrations_hmrc')
    .select('mtd_vat_access_token_encrypted, mtd_vat_refresh_token_encrypted, mtd_vat_expires_at, mtd_vat_connected')
    .eq('organization_id', orgId)
    .single();
  
  if (fetchError || !hmrcIntegration) {
    logError(traceId, new Error('HMRC integration not found'), { orgId });
    throw new HmrcAuthError('HMRC_NOT_CONNECTED', 'HMRC integration not configured for this organization');
  }
  
  if (!hmrcIntegration.mtd_vat_connected) {
    logError(traceId, new Error('HMRC not connected'), { orgId });
    throw new HmrcAuthError('HMRC_NOT_CONNECTED', 'HMRC MTD VAT is not connected');
  }
  
  if (!hmrcIntegration.mtd_vat_access_token_encrypted) {
    throw new HmrcAuthError('HMRC_TOKEN_MISSING', 'HMRC access token not found');
  }
  
  const expiresAt = new Date(hmrcIntegration.mtd_vat_expires_at);
  const now = new Date();
  const bufferTime = new Date(now.getTime() + TOKEN_EXPIRY_BUFFER_SECONDS * 1000);
  
  // Check if token is still valid (with buffer)
  if (expiresAt > bufferTime) {
    logInfo(traceId, 'Using existing HMRC token', { orgId, expiresAt: expiresAt.toISOString() });
    const accessToken = await decryptValue(hmrcIntegration.mtd_vat_access_token_encrypted);
    return { accessToken, expiresAt };
  }
  
  // Token expired or about to expire - refresh it
  logInfo(traceId, 'Refreshing HMRC token', { orgId, expiredAt: expiresAt.toISOString() });
  
  if (!hmrcIntegration.mtd_vat_refresh_token_encrypted) {
    throw new HmrcAuthError('HMRC_REFRESH_TOKEN_MISSING', 'HMRC refresh token not found - re-authorization required');
  }
  
  if (!HMRC_CLIENT_ID || !HMRC_CLIENT_SECRET) {
    throw new HmrcAuthError('HMRC_NOT_CONFIGURED', 'HMRC client credentials not configured');
  }
  
  const refreshToken = await decryptValue(hmrcIntegration.mtd_vat_refresh_token_encrypted);
  
  // Call HMRC token endpoint
  const tokenResponse = await fetch(`${HMRC_AUTH_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: HMRC_CLIENT_ID,
      client_secret: HMRC_CLIENT_SECRET,
    }),
  });
  
  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    logError(traceId, new Error('HMRC token refresh failed'), { 
      orgId, 
      status: tokenResponse.status,
      error: errorText.substring(0, 200)
    });
    
    // Check for specific error types
    if (tokenResponse.status === 400 || tokenResponse.status === 401) {
      throw new HmrcAuthError('HMRC_REAUTH_REQUIRED', 'HMRC authorization expired - please re-connect HMRC');
    }
    
    throw new HmrcAuthError('HMRC_REFRESH_FAILED', `Failed to refresh HMRC token: ${tokenResponse.status}`);
  }
  
  const tokens = await tokenResponse.json();
  
  // Encrypt and store new tokens
  const encryptedAccessToken = await encryptValue(tokens.access_token);
  const encryptedRefreshToken = tokens.refresh_token 
    ? await encryptValue(tokens.refresh_token) 
    : hmrcIntegration.mtd_vat_refresh_token_encrypted; // Keep old refresh token if not provided
  
  const newExpiresAt = new Date(Date.now() + (tokens.expires_in || 14400) * 1000);
  
  const { error: updateError } = await adminClient
    .from('organization_integrations_hmrc')
    .update({
      mtd_vat_access_token_encrypted: encryptedAccessToken,
      mtd_vat_refresh_token_encrypted: encryptedRefreshToken,
      mtd_vat_expires_at: newExpiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId);
  
  if (updateError) {
    logWarn(traceId, 'Failed to persist refreshed HMRC tokens', { orgId, error: updateError.message });
    // Don't throw - we still have a valid token to use
  }
  
  logInfo(traceId, 'HMRC token refreshed successfully', { orgId, newExpiresAt: newExpiresAt.toISOString() });
  
  return {
    accessToken: tokens.access_token,
    expiresAt: newExpiresAt,
  };
}

/**
 * Custom error class for HMRC authentication errors
 */
export class HmrcAuthError extends Error {
  code: string;
  retryable: boolean;
  
  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = 'HmrcAuthError';
    this.code = code;
    this.retryable = retryable;
  }
}
