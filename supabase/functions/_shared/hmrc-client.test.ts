/**
 * Deno tests for the HMRC client chokepoint (callHmrc).
 *
 * Run in CI with:  deno test -A supabase/functions/_shared/hmrc-client.test.ts
 *
 * These exercise the integration wiring (fetch + fraud headers + audit) that the
 * runtime-agnostic bun harness cannot: they stub global fetch and the admin
 * Supabase client and assert on the real outbound request and the audit row.
 *
 * Covers DoD #8 (fraud headers attached), #10 (audit redaction at the call site),
 * #12 (Hello World audited).
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { callHmrc } from './hmrc-client.ts';
import { CONNECTION_METHOD } from './hmrc-fraud-prevention.ts';
import { REDACTED } from './redaction.ts';

interface CapturedAudit {
  table: string;
  row: Record<string, unknown>;
}

function fakeAdminClient(captured: CapturedAudit[]) {
  return {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          captured.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as Parameters<typeof callHmrc>[0]['adminClient'];
}

function stubFetch(handler: (url: string, init: RequestInit) => Response): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init ?? {}))) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const baseFraud = {
  client: {
    deviceId: 'dev-1',
    timezone: 'UTC+00:00',
    screens: 'width=1920&height=1080&scaling-factor=1&colour-depth=24',
    windowSize: 'width=1280&height=720',
    browserJsUserAgent: 'Mozilla/5.0',
    doNotTrack: 'false',
    browserPlugins: '',
  },
  server: { userId: 'user-1', publicIp: '203.0.113.1', publicIpTimestamp: '2026-06-15T00:00:00Z' },
  vendor: { productName: 'AccountancyOS', version: '2.0.0', licenseIds: 'AccountancyOS=abc' },
};

Deno.test('Hello World attaches fraud headers and is audited (redacted)', async () => {
  const captured: CapturedAudit[] = [];
  let seenHeaders: Headers | undefined;

  const restore = stubFetch((_url, init) => {
    seenHeaders = new Headers(init.headers as HeadersInit);
    return new Response(JSON.stringify({ message: 'Hello World' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-CorrelationId': 'corr-123' },
    });
  });

  try {
    const result = await callHmrc({
      adminClient: fakeAdminClient(captured),
      orgId: 'org-1',
      traceId: 't-1',
      method: 'GET',
      path: '/hello/world',
      environment: 'sandbox',
      fraud: baseFraud,
      authMode: 'none',
      eventType: 'hello_world',
    });

    // Call succeeded and parsed.
    assertEquals(result.ok, true);
    assertEquals(result.status, 200);
    assertEquals(result.correlationId, 'corr-123');

    // Fraud-prevention headers were attached to the OUTBOUND request.
    assertEquals(seenHeaders?.get('Gov-Client-Connection-Method'), CONNECTION_METHOD);
    assert(seenHeaders?.get('Gov-Client-Device-ID'), 'device id header missing');
    assertEquals(seenHeaders?.get('Gov-Client-User-IDs'), 'os=user-1');
    assert(seenHeaders?.get('Gov-Vendor-Product-Name'), 'vendor product header missing');

    // Exactly one audit row, with correct routing and no secrets.
    const audits = captured.filter((c) => c.table === 'filing_provider_events');
    assertEquals(audits.length, 1);
    assertEquals(audits[0].row.provider, 'HMRC');
    assertEquals(audits[0].row.event_type, 'hello_world');
    assertEquals(audits[0].row.environment, 'sandbox');
    assertEquals(audits[0].row.correlation_id, 'corr-123');
  } finally {
    restore();
  }
});

Deno.test('audited request summary never contains a raw bearer token', async () => {
  const captured: CapturedAudit[] = [];
  const restore = stubFetch(
    () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
  try {
    // Force an Authorization-bearing summary by auditing through a POST body that
    // includes a token-like field; the redactor must scrub it.
    await callHmrc({
      adminClient: fakeAdminClient(captured),
      orgId: 'org-1',
      traceId: 't-2',
      method: 'POST',
      path: '/test/leak',
      environment: 'sandbox',
      fraud: baseFraud,
      authMode: 'none',
      body: { access_token: 'eyJsecret', note: 'Bearer eyJ0eXAi.payload.sig' },
      eventType: 'request',
    });

    const audit = captured.find((c) => c.table === 'filing_provider_events');
    const summary = JSON.stringify(audit?.row.request_summary ?? {});
    assertStringIncludes(summary, REDACTED);
    assert(!summary.includes('eyJsecret'), 'raw access_token leaked into audit');
    assert(!summary.includes('eyJ0eXAi.payload.sig'), 'raw bearer token leaked into audit');
  } finally {
    restore();
  }
});

Deno.test('absolute URLs are rejected (token-exfiltration guard)', async () => {
  const captured: CapturedAudit[] = [];
  let threw = false;
  try {
    await callHmrc({
      adminClient: fakeAdminClient(captured),
      orgId: 'org-1',
      traceId: 't-3',
      method: 'GET',
      path: 'https://evil.example.com/steal',
      environment: 'sandbox',
      fraud: baseFraud,
      authMode: 'none',
    });
  } catch {
    threw = true;
  }
  assert(threw, 'absolute path should be rejected');
});
