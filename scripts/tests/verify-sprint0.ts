/**
 * Sprint 0 verification harness (runtime-agnostic logic + governance invariants).
 *
 * Runnable with either:
 *   bun  scripts/tests/verify-sprint0.ts
 *   deno run -A scripts/tests/verify-sprint0.ts
 *
 * This covers the Definition-of-Done invariants that can be proven without a
 * live database or a live HMRC connection:
 *   - fraud-prevention header merge (DoD #8)
 *   - audit secret redaction (DoD #10)
 *   - approval-gate / projection / submission state guards (DoD #4,#5,#6)
 *   - source-hash validation (DoD #4)
 *   - invalid state transitions rejected (DoD: enforcement)
 *   - no HMRC calls bypass the proxy chokepoint (DoD #9)
 *   - no duplicate approval artefact introduced (DoD #13)
 *
 * DB-level invariants (cross-tenant RLS, snapshot immutability, the HMRC Hello
 * World round-trip) are covered separately — see scripts/tests/sprint0-enforcement.sql
 * and supabase/functions/hmrc-call-proxy/index.test.ts.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  redactSecrets,
  redactHeaders,
  isSensitiveKey,
  REDACTED,
} from '../../supabase/functions/_shared/redaction.ts';
import {
  mergeFraudPreventionHeaders,
  REQUIRED_FRAUD_HEADERS,
  CONNECTION_METHOD,
} from '../../supabase/functions/_shared/hmrc-fraud-prevention.ts';
import {
  assertProjectionAllowed,
  assertSubmissionAllowed,
  assertValidFilingTransition,
  isValidFilingTransition,
  FilingStateError,
} from '../../supabase/functions/_shared/filing-state-machine.ts';
import {
  detectDirectHmrcCalls,
  auditApprovalArtefacts,
  CANONICAL_APPROVAL_TABLES,
  type SourceFile,
} from './lib/governance.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${msg}`);
    console.log(`  ✗ ${name}\n      ${msg}`);
  }
}

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

function assertThrows(fn: () => void, code: string): void {
  try {
    fn();
  } catch (err) {
    if (err instanceof FilingStateError) {
      assert(err.code === code, `expected error code ${code}, got ${err.code}`);
      return;
    }
    throw err;
  }
  throw new Error(`expected throw with code ${code}, but nothing was thrown`);
}

function walk(dir: string, predicate: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      out.push(...walk(full, predicate));
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function loadSources(rel: string, ext: string): SourceFile[] {
  const base = join(REPO_ROOT, rel);
  return walk(base, (p) => p.endsWith(ext)).map((p) => ({
    path: p,
    content: readFileSync(p, 'utf8'),
  }));
}

// ---------------------------------------------------------------------------
console.log('\nDoD #8 — Proxy attaches fraud-prevention headers');

check('all required Gov-* headers present when client+server data supplied', () => {
  const { headers, missing } = mergeFraudPreventionHeaders({
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
  });
  assert(missing.length === 0, `missing required headers: ${missing.join(', ')}`);
  for (const h of REQUIRED_FRAUD_HEADERS) {
    assert(headers[h] && headers[h].length > 0, `header ${h} not populated`);
  }
  assert(headers['Gov-Client-Connection-Method'] === CONNECTION_METHOD, 'wrong connection method');
  assert(headers['Gov-Client-User-IDs'] === 'os=user-1', 'user id not mapped');
});

check('missing required headers are reported when client data absent', () => {
  const { missing } = mergeFraudPreventionHeaders({
    server: { userId: 'u' },
    vendor: { productName: 'AccountancyOS', version: '2.0.0' },
  });
  assert(missing.length > 0, 'expected missing headers to be reported');
  assert(missing.includes('Gov-Client-Device-ID'), 'device id should be reported missing');
});

// ---------------------------------------------------------------------------
console.log('\nDoD #10 — Audit redacts secrets');

check('sensitive keys are redacted at any depth', () => {
  const audit = redactSecrets({
    method: 'POST',
    access_token: 'eyJsecret',
    nested: { refreshToken: 'r-123', clientSecret: 's-1', safe: 'keep' },
    list: [{ Authorization: 'Bearer eyJabc' }],
  }) as any;
  assert(audit.access_token === REDACTED, 'access_token not redacted');
  assert(audit.nested.refreshToken === REDACTED, 'refreshToken not redacted');
  assert(audit.nested.clientSecret === REDACTED, 'clientSecret not redacted');
  assert(audit.nested.safe === 'keep', 'non-sensitive value was destroyed');
  assert(audit.list[0].Authorization === REDACTED, 'authorization not redacted');
});

check('bearer tokens embedded in strings are scrubbed', () => {
  const headers = redactHeaders({
    Accept: 'application/json',
    Authorization: 'Bearer eyJ0eXAiOiJKV1Qi.payload.sig',
    'Gov-Vendor-Version': '2.0.0',
  });
  assert(headers['Authorization'] === REDACTED, 'authorization header not redacted');
  assert(headers['Accept'] === 'application/json', 'accept header altered');
  assert(headers['Gov-Vendor-Version'] === '2.0.0', 'vendor header altered');
});

check('key classifier catches separator variants', () => {
  assert(isSensitiveKey('access_token'), 'access_token');
  assert(isSensitiveKey('accessToken'), 'accessToken');
  assert(isSensitiveKey('Access-Token'), 'Access-Token');
  assert(!isSensitiveKey('endpoint'), 'endpoint false positive');
});

// ---------------------------------------------------------------------------
console.log('\nDoD #4,#5,#6 — Approval gate / projection / submission guards');

check('projection rejected without an approved artefact', () => {
  assertThrows(() => assertProjectionAllowed({ hasActiveApproval: false }), 'NO_APPROVED_ARTEFACT');
});

check('projection rejected on source-hash mismatch', () => {
  assertThrows(
    () => assertProjectionAllowed({ hasActiveApproval: true, approvalSnapshotHash: 'a', modelSnapshotHash: 'b' }),
    'SOURCE_HASH_MISMATCH',
  );
});

check('projection allowed when approved and hashes match', () => {
  assertProjectionAllowed({ hasActiveApproval: true, approvalSnapshotHash: 'h', modelSnapshotHash: 'h' });
});

check('submission rejected without a projection', () => {
  assertThrows(() => assertSubmissionAllowed({ hasProjection: false }), 'NO_PROJECTION');
});

check('submission rejected when projection not bound to approval', () => {
  assertThrows(
    () => assertSubmissionAllowed({ hasProjection: true, projectionSnapshotHash: 'x', approvalSnapshotHash: 'y' }),
    'PROJECTION_HASH_MISMATCH',
  );
});

check('invalid state transition rejected; valid one allowed', () => {
  assert(isValidFilingTransition('approved', 'ready_to_file'), 'approved->ready_to_file should be valid');
  assert(!isValidFilingTransition('filed', 'draft'), 'filed is terminal');
  assertThrows(() => assertValidFilingTransition('draft', 'filed'), 'INVALID_STATE_TRANSITION');
});

// ---------------------------------------------------------------------------
console.log('\nDoD #9 — No HMRC calls bypass the proxy');

check('no new (non-allowlisted) edge function calls HMRC directly', () => {
  const files = loadSources('supabase/functions', '.ts');
  const report = detectDirectHmrcCalls(files);
  if (report.knownDebt.length > 0) {
    console.log(`      (known legacy debt pending migration: ${report.knownDebt.length} files)`);
  }
  assert(
    report.violations.length === 0,
    `new direct HMRC callers must use hmrc-call-proxy: ${report.violations.join(', ')}`,
  );
});

// ---------------------------------------------------------------------------
console.log('\nDoD #13 — No parallel approval artefact created');

check('no prohibited approval table; canonical approval spine present', () => {
  const migrations = loadSources('supabase/migrations', '.sql').map((f) => f.content);
  const report = auditApprovalArtefacts(migrations);
  assert(
    report.duplicates.length === 0,
    `prohibited duplicate approval artefact(s) found: ${report.duplicates.join(', ')}`,
  );
  assert(
    report.canonicalMissing.length === 0,
    `canonical approval tables missing (engine has nothing to consume): ${report.canonicalMissing.join(', ')}`,
  );
  console.log(`      (consuming existing: ${CANONICAL_APPROVAL_TABLES.join(', ')})`);
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
  // deno + node both honour this.
  (globalThis as any).process?.exit?.(1);
  throw new Error('Sprint 0 verification failed');
}
console.log('Sprint 0 logic & governance invariants: PASS');
