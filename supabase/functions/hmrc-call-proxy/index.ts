/**
 * hmrc-call-proxy — the single network chokepoint for HMRC API traffic.
 *
 * Sprint 0 responsibilities:
 *   - authenticate the caller and resolve org context (reusing _shared/auth.ts);
 *   - merge fraud-prevention headers and route the call through callHmrc();
 *   - audit every call (redacted) to filing_provider_events;
 *   - provide a "Hello World" round-trip used by the Sprint 0 Definition of Done.
 *
 * No HMRC fetch happens inline here — all outbound traffic flows through
 * _shared/hmrc-client.ts, which the no-bypass governance test enforces.
 *
 * Actions:
 *   { "action": "hello_world", "environment"?: "sandbox" }
 *   { "action": "request", "method": "...", "path": "/...", "environment": "...",
 *     "authMode": "user"|"none", "body"?: ..., "accept"?: "...",
 *     "fraudPrevention"?: { ...client signals... }, "filingId"?: "..." }
 */

import { handleCors, corsHeaders } from '../_shared/cors.ts';
import { newTraceId, logInfo } from '../_shared/logging.ts';
import { ok, fail, ErrorCodes } from '../_shared/responses.ts';
import { requireOrgContext, AuthError } from '../_shared/auth.ts';
import { getAdminClient } from '../_shared/supabase.ts';
import { callHmrc, HmrcCallError, HmrcEnvironment, HmrcAuthMode } from '../_shared/hmrc-client.ts';
import { ClientFraudData, ServerFraudData, vendorConfigFromEnv } from '../_shared/hmrc-fraud-prevention.ts';

function clientIpFrom(req: Request): string | undefined {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? undefined;
}

function parseEnvironment(value: unknown): HmrcEnvironment {
  return value === 'production' ? 'production' : 'sandbox';
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const traceId = newTraceId();

  try {
    if (req.method !== 'POST') {
      return fail(req, { code: ErrorCodes.VALIDATION_ERROR, message: 'POST required' }, traceId, 405);
    }

    const ctx = await requireOrgContext(req, traceId);
    const adminClient = getAdminClient();

    const payload = await req.json().catch(() => ({}));
    const action: string = payload.action ?? 'request';

    const clientFraud: ClientFraudData = payload.fraudPrevention ?? {};
    const serverFraud: ServerFraudData = {
      userId: ctx.user.id,
      publicIp: clientIpFrom(req),
      publicIpTimestamp: new Date().toISOString(),
      forwarded: req.headers.get('forwarded') ?? undefined,
    };
    const fraud = {
      client: clientFraud,
      server: serverFraud,
      vendor: vendorConfigFromEnv((k) => Deno.env.get(k)),
    };

    if (action === 'hello_world') {
      // Open HMRC endpoint — proves the proxy path end-to-end, attaches fraud
      // headers, and produces an audited filing_provider_events record.
      const env = parseEnvironment(payload.environment);
      const result = await callHmrc({
        adminClient,
        orgId: ctx.orgId,
        traceId,
        method: 'GET',
        path: '/hello/world',
        environment: env,
        fraud,
        authMode: 'none',
        eventType: 'hello_world',
      });

      logInfo(traceId, 'Hello World via proxy complete', { orgId: ctx.orgId, status: result.status });

      if (!result.ok) {
        return fail(
          req,
          { code: ErrorCodes.HMRC_ERROR, message: result.error?.message ?? 'Hello World failed', retryable: result.error?.retryable },
          traceId,
          502,
        );
      }
      return ok(req, { status: result.status, correlationId: result.correlationId, data: result.body }, traceId);
    }

    if (action === 'request') {
      const method = (payload.method ?? 'GET').toUpperCase();
      const path: string = payload.path ?? '';
      if (!path || typeof path !== 'string') {
        return fail(req, { code: ErrorCodes.MISSING_REQUIRED_FIELD, message: 'path is required' }, traceId, 400);
      }
      if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) {
        return fail(req, { code: ErrorCodes.VALIDATION_ERROR, message: 'unsupported method' }, traceId, 400);
      }

      const authMode: HmrcAuthMode = payload.authMode === 'none' ? 'none' : 'user';
      const result = await callHmrc({
        adminClient,
        orgId: ctx.orgId,
        traceId,
        method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
        path,
        environment: parseEnvironment(payload.environment),
        fraud,
        authMode,
        body: payload.body,
        accept: payload.accept,
        filingId: payload.filingId,
        eventType: payload.eventType ?? 'request',
      });

      if (!result.ok) {
        return fail(
          req,
          {
            code: ErrorCodes.HMRC_ERROR,
            message: result.error?.message ?? 'HMRC request failed',
            details: result.error?.code,
            retryable: result.error?.retryable,
          },
          traceId,
          502,
        );
      }
      return ok(req, { status: result.status, correlationId: result.correlationId, data: result.body }, traceId);
    }

    return fail(req, { code: ErrorCodes.VALIDATION_ERROR, message: `Unknown action: ${action}` }, traceId, 400);
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(req, err.toErrorDetails(), traceId, err.status);
    }
    if (err instanceof HmrcCallError) {
      return fail(
        req,
        { code: err.normalized.code, message: err.normalized.message, retryable: err.normalized.retryable },
        traceId,
        502,
      );
    }
    return new Response(
      JSON.stringify({ success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Unexpected error' }, traceId }),
      { status: 500, headers: { ...corsHeaders(req), 'X-Trace-Id': traceId } },
    );
  }
});
