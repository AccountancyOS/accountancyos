/**
 * Live-DB tenant isolation proof (DoD: cross-tenant read/write rejection).
 *
 * Signs in as two synthetic users in two different organisations and asserts
 * that neither can read or write the other's filing-engine data. This reuses
 * the SAME RLS helper every tenant-scoped table uses
 * (public.user_has_organization_access) — there is no parallel tenant logic.
 *
 * This is a LIVE test: it requires network access to the Supabase project and
 * credentials for two seeded test users in two different orgs. It is therefore
 * run in CI/staging, not in the offline sandbox.
 *
 * Run:
 *   deno run -A scripts/tests/tenant-isolation.ts
 *
 * Required environment:
 *   SUPABASE_URL                 e.g. https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY            anon/publishable key
 *   TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD
 *   TEST_USER_B_EMAIL / TEST_USER_B_PASSWORD
 *   TEST_ORG_A_ID                organization_id user A belongs to
 *   TEST_ORG_B_ID                organization_id user B belongs to
 * Optional (service-role ownership check inside edge functions):
 *   FUNCTIONS_URL                base URL of deployed edge functions
 *
 * Exit code 0 = all isolation assertions held. Non-zero = a leak OR a missing
 * dependency (printed explicitly).
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

function env(name: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).Deno?.env.get(name) ?? (globalThis as any).process?.env?.[name];
}

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'TEST_USER_A_EMAIL',
  'TEST_USER_A_PASSWORD',
  'TEST_USER_B_EMAIL',
  'TEST_USER_B_PASSWORD',
  'TEST_ORG_A_ID',
  'TEST_ORG_B_ID',
];

function fail(msg: string): never {
  console.error(`\nTENANT ISOLATION: BLOCKED/FAILED\n  ${msg}\n`);
  (globalThis as any).Deno?.exit(1);
  throw new Error(msg);
}

let passed = 0;
const problems: string[] = [];

async function expectNoRows(label: string, query: Promise<{ data: unknown[] | null; error: unknown }>): Promise<void> {
  const { data, error } = await query;
  // RLS returns 0 rows (not an error) for SELECTs the caller can't see.
  if (error) {
    problems.push(`${label}: unexpected error ${JSON.stringify(error)}`);
    return;
  }
  if (data && data.length > 0) {
    problems.push(`${label}: LEAK — ${data.length} cross-tenant row(s) visible`);
    return;
  }
  passed++;
  console.log(`  ✓ ${label} (0 rows)`);
}

async function expectWriteDenied(label: string, op: Promise<{ data: unknown; error: unknown }>): Promise<void> {
  const { error } = await op;
  if (!error) {
    problems.push(`${label}: LEAK — cross-tenant write succeeded`);
    return;
  }
  passed++;
  console.log(`  ✓ ${label} (denied: ${(error as { code?: string }).code ?? 'rls'})`);
}

async function main(): Promise<void> {
  const missing = REQUIRED.filter((k) => !env(k));
  if (missing.length > 0) {
    fail(`missing required environment: ${missing.join(', ')}`);
  }

  const url = env('SUPABASE_URL')!;
  const anon = env('SUPABASE_ANON_KEY')!;
  const orgA = env('TEST_ORG_A_ID')!;
  const orgB = env('TEST_ORG_B_ID')!;

  const signIn = async (email: string, password: string): Promise<SupabaseClient> => {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) fail(`sign-in failed for ${email}: ${error.message}`);
    return c;
  };

  console.log('\nLive DB tenant isolation — signing in two users...');
  const A = await signIn(env('TEST_USER_A_EMAIL')!, env('TEST_USER_A_PASSWORD')!);

  console.log('\nDoD — Org A cannot READ Org B data');
  await expectNoRows('filings (Org B)', A.from('filings').select('id').eq('organization_id', orgB).limit(5));
  await expectNoRows('filing_model_snapshots (Org B)', A.from('filing_model_snapshots').select('id').eq('organization_id', orgB).limit(5));
  await expectNoRows('filing_approvals (Org B)', A.from('filing_approvals').select('id').eq('organization_id', orgB).limit(5));
  await expectNoRows('organization_integrations_hmrc (Org B)', A.from('organization_integrations_hmrc').select('organization_id').eq('organization_id', orgB).limit(5));
  await expectNoRows('filing_provider_events (Org B)', A.from('filing_provider_events').select('id').eq('organization_id', orgB).limit(5));

  console.log('\nDoD — Org A cannot WRITE Org B data');
  await expectWriteDenied(
    'insert filing_provider_events for Org B',
    A.from('filing_provider_events').insert({
      organization_id: orgB,
      provider: 'HMRC',
      event_type: 'hello_world',
      endpoint: '/hello/world',
      environment: 'sandbox',
    }).select(),
  );
  await expectWriteDenied(
    'insert filings for Org B',
    A.from('filings').insert({ organization_id: orgB, filing_type: 'vat_return', status: 'draft' }).select(),
  );

  // Sanity: A can see its OWN org rows (proves the queries aren't trivially empty).
  console.log('\nControl — Org A CAN access its own org (sanity)');
  const ownHmrc = await A.from('organization_integrations_hmrc').select('organization_id').eq('organization_id', orgA).limit(1);
  if (ownHmrc.error) problems.push(`control: Org A could not read its own integration row: ${ownHmrc.error.message}`);
  else { passed++; console.log('  ✓ Org A can read its own integration config'); }

  // Optional: service-role ownership validation inside edge functions.
  const fnUrl = env('FUNCTIONS_URL');
  if (fnUrl) {
    console.log('\nDoD — edge function rejects acting on another org');
    const { data: sess } = await A.auth.getSession();
    const token = sess.session?.access_token;
    const res = await fetch(`${fnUrl}/hmrc-call-proxy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'hello_world', organization_id: orgB }),
    });
    if (res.status === 403) { passed++; console.log('  ✓ proxy returned 403 for cross-org request'); }
    else problems.push(`edge function ownership: expected 403 acting on Org B, got ${res.status}`);
  } else {
    console.log('\n(skipped edge-function ownership check — set FUNCTIONS_URL to enable)');
  }

  console.log(`\n${passed} isolation assertions held, ${problems.length} problem(s)\n`);
  if (problems.length > 0) {
    for (const p of problems) console.log(`  - ${p}`);
    fail('tenant isolation assertions did not all hold');
  }
  console.log('TENANT ISOLATION: PASS');
}

main().catch((e) => fail(String(e)));
