/**
 * HMRC client — the SINGLE sanctioned path for outbound HMRC API calls.
 *
 * Every HMRC API request in the filing engine must go through callHmrc(). This
 * module:
 *   - resolves a valid access token (reusing _shared/hmrc-auth.ts);
 *   - attaches fraud-prevention headers (reusing _shared/hmrc-fraud-prevention.ts);
 *   - normalises errors (reusing _shared/hmrc-errors.ts);
 *   - writes a REDACTED audit record to filing_provider_events.
 *
 * The hmrc-call-proxy edge function is the only caller for new code. Legacy
 * submit functions (hmrc-vat-submit, hmrc-ct-submit, etc.) still call HMRC
 * directly and are tracked for migration by the no-bypass governance test.
 *
 * NOTE: this file uses Deno APIs (Deno.env, fetch) and is exercised by the Deno
 * test suite, not the bun verification harness.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { getValidHmrcAccessToken } from './hmrc-auth.ts';
import { normalizeHmrcError, HmrcNormalizedError } from './hmrc-errors.ts';
import {
  FraudPreventionInput,
  mergeFraudPreventionHeaders,
  vendorConfigFromEnv,
} from './hmrc-fraud-prevention.ts';
import { redactSecrets, redactHeaders } from './redaction.ts';
import { logInfo, logWarn, logError } from './logging.ts';

export type HmrcEnvironment = 'sandbox' | 'production';
export type HmrcAuthMode = 'user' | 'none';

const HMRC_BASE: Record<HmrcEnvironment, string> = {
  sandbox: Deno.env.get('HMRC_SANDBOX_BASE_URL') ?? 'https://test-api.service.hmrc.gov.uk',
  production: Deno.env.get('HMRC_PRODUCTION_BASE_URL') ?? 'https://api.service.hmrc.gov.uk',
};

export interface HmrcCallInput {
  adminClient: SupabaseClient;
  orgId: string;
  traceId: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Path beginning with "/", e.g. "/hello/world" or "/organisations/vat/...". */
  path: string;
  environment: HmrcEnvironment;
  /** Fraud-prevention signals (client + server). Required for API calls. */
  fraud: FraudPreventionInput;
  authMode: HmrcAuthMode;
  body?: unknown;
  /** Accept header — HMRC APIs are versioned via Accept. */
  accept?: string;
  contentType?: string;
  /** For audit linkage. */
  filingId?: string;
  eventType?: 'hello_world' | 'obligations_fetch' | 'submit' | 'status_check' | 'request';
}

export interface HmrcCallResult {
  ok: boolean;
  status: number;
  body: unknown;
  correlationId: string | null;
  error?: HmrcNormalizedError;
}

export class HmrcCallError extends Error {
  normalized: HmrcNormalizedError;
  correlationId: string | null;
  constructor(normalized: HmrcNormalizedError, correlationId: string | null) {
    super(normalized.message);
    this.name = 'HmrcCallError';
    this.normalized = normalized;
    this.correlationId = correlationId;
  }
}

function pathIsSafe(path: string): boolean {
  // Only relative HMRC paths are permitted — never a full URL (which could
  // redirect the call away from HMRC and exfiltrate the bearer token).
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('://');
}

/**
 * Persist a redacted audit record for an HMRC call. Best-effort: an audit
 * failure must not mask the actual call result, but is logged.
 */
async function writeAudit(
  input: HmrcCallInput,
  endpoint: string,
  requestHeaders: Record<string, string>,
  requestBody: unknown,
  status: number,
  responseBody: unknown,
  correlationId: string | null,
  durationMs: number,
): Promise<void> {
  try {
    const requestSummary = redactSecrets({
      method: input.method,
      headers: redactHeaders(requestHeaders),
      body: requestBody ?? null,
    });
    const responseSummary = redactSecrets({
      correlationId,
      body: responseBody ?? null,
    });

    const { error } = await input.adminClient.from('filing_provider_events').insert({
      filing_id: input.filingId ?? null,
      organization_id: input.orgId,
      provider: 'HMRC',
      event_type: input.eventType ?? 'request',
      endpoint,
      environment: input.environment,
      correlation_id: correlationId,
      request_summary: requestSummary,
      response_status: status,
      response_summary: responseSummary,
      duration_ms: durationMs,
    });
    if (error) {
      logWarn(input.traceId, 'Failed to write filing_provider_events audit', {
        orgId: input.orgId,
        error: error.message,
      });
    }
  } catch (err) {
    logWarn(input.traceId, 'Audit write threw', { orgId: input.orgId, error: String(err) });
  }
}

/**
 * The single sanctioned HMRC call. Attaches auth + fraud headers, performs the
 * request, audits a redacted summary, and normalises errors.
 */
export async function callHmrc(input: HmrcCallInput): Promise<HmrcCallResult> {
  if (!pathIsSafe(input.path)) {
    throw new HmrcCallError(
      { code: 'INVALID_PATH', message: 'Only relative HMRC API paths are permitted', retryable: false },
      null,
    );
  }

  const base = HMRC_BASE[input.environment];
  const url = `${base}${input.path}`;

  // Build fraud-prevention headers (with vendor identity from env).
  const fraudInput: FraudPreventionInput = {
    ...input.fraud,
    vendor: input.fraud.vendor ?? vendorConfigFromEnv((k) => Deno.env.get(k)),
  };
  const { headers: fraudHeaders, missing } = mergeFraudPreventionHeaders(fraudInput);
  if (missing.length > 0) {
    logWarn(input.traceId, 'Outbound HMRC call missing fraud-prevention headers', {
      orgId: input.orgId,
      missing: missing.join(','),
    });
  }

  const headers: Record<string, string> = {
    Accept: input.accept ?? 'application/vnd.hmrc.1.0+json',
    ...fraudHeaders,
  };
  if (input.body !== undefined) {
    headers['Content-Type'] = input.contentType ?? 'application/json';
  }
  if (input.authMode === 'user') {
    const { accessToken } = await getValidHmrcAccessToken(input.adminClient, {
      orgId: input.orgId,
      traceId: input.traceId,
    });
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const started = Date.now();
  let status = 0;
  let responseBody: unknown = null;
  let correlationId: string | null = null;

  try {
    const res = await fetch(url, {
      method: input.method,
      headers,
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    });
    status = res.status;
    correlationId = res.headers.get('X-CorrelationId') ?? res.headers.get('x-correlationid');

    const text = await res.text();
    try {
      responseBody = text ? JSON.parse(text) : null;
    } catch {
      responseBody = text;
    }

    const durationMs = Date.now() - started;
    await writeAudit(input, url, headers, input.body ?? null, status, responseBody, correlationId, durationMs);

    if (!res.ok) {
      const normalized = normalizeHmrcError({
        status,
        body: typeof responseBody === 'object' ? responseBody : undefined,
        errorText: typeof responseBody === 'string' ? responseBody : undefined,
      });
      logInfo(input.traceId, 'HMRC call returned error', {
        orgId: input.orgId,
        status,
        code: normalized.code,
      });
      return { ok: false, status, body: responseBody, correlationId, error: normalized };
    }

    logInfo(input.traceId, 'HMRC call succeeded', { orgId: input.orgId, status, endpoint: input.path });
    return { ok: true, status, body: responseBody, correlationId };
  } catch (err) {
    const durationMs = Date.now() - started;
    logError(input.traceId, err, { orgId: input.orgId, endpoint: input.path });
    await writeAudit(input, url, headers, input.body ?? null, status || 0, { error: String(err) }, correlationId, durationMs);
    throw new HmrcCallError(
      { code: 'HMRC_NETWORK_ERROR', message: 'Failed to reach HMRC', retryable: true },
      correlationId,
    );
  }
}
