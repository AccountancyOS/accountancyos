/**
 * Pure repository-governance checks used by the Sprint 0 enforcement tests.
 *
 * These functions operate on file contents passed in (no IO), so they run
 * identically under bun, node and Deno. The callers (verify-sprint0 harness and
 * the Deno test suite) are responsible for reading files.
 */

export interface SourceFile {
  path: string;
  content: string;
}

/** Hostnames that indicate a direct HMRC API call. */
const HMRC_HOSTS = [
  'api.service.hmrc.gov.uk',
  'test-api.service.hmrc.gov.uk',
  'transaction-engine.tax.service.gov.uk',
  'test-transaction-engine.tax.service.gov.uk',
];

/**
 * Files permitted to reference HMRC hosts directly.
 *
 *  - hmrc-client.ts        : the sanctioned chokepoint itself.
 *  - hmrc-auth.ts          : the OAuth token endpoint (separate auth concern).
 *  - hmrc-fraud-prevention : documentation/spec URL only.
 *
 * Legacy submit/obligation functions that still call HMRC directly are listed
 * as KNOWN DEBT: the test reports them but does not fail, and fails hard the
 * moment a NEW file outside this list introduces a direct call. Migrating these
 * onto the proxy is a tracked follow-up sprint (see docs/filing-engine-v2-sprint0.md).
 */
export const PROXY_ALLOWLIST = [
  'supabase/functions/_shared/hmrc-client.ts',
  'supabase/functions/_shared/hmrc-auth.ts',
  'supabase/functions/_shared/hmrc-fraud-prevention.ts',
];

export const LEGACY_DIRECT_CALL_DEBT = [
  'supabase/functions/hmrc-vat-submit/index.ts',
  'supabase/functions/hmrc-vat-obligations/index.ts',
  'supabase/functions/hmrc-ct-submit/index.ts',
  'supabase/functions/hmrc-ct-poll/index.ts',
  'supabase/functions/hmrc-ct-delete/index.ts',
  'supabase/functions/hmrc-auth/index.ts',
  'supabase/functions/hmrc-callback/index.ts',
  'supabase/functions/rti-submit/index.ts',
  'supabase/functions/cis-submit/index.ts',
];

function normalise(path: string): string {
  return path.replace(/^.*\/accountancyos\//, '').replace(/^\.\//, '');
}

function referencesHmrcHost(content: string): boolean {
  return HMRC_HOSTS.some((host) => content.includes(host));
}

export interface BypassReport {
  /** New, un-sanctioned files calling HMRC directly — these FAIL the build. */
  violations: string[];
  /** Known legacy debt still calling directly — reported, does not fail. */
  knownDebt: string[];
}

/**
 * Find edge-function files that call HMRC hosts directly outside the sanctioned
 * chokepoint. Returns violations (fail) separately from known legacy debt.
 */
export function detectDirectHmrcCalls(files: SourceFile[]): BypassReport {
  const violations: string[] = [];
  const knownDebt: string[] = [];

  for (const file of files) {
    const rel = normalise(file.path);
    if (!rel.startsWith('supabase/functions/')) continue;
    if (!referencesHmrcHost(file.content)) continue;
    if (PROXY_ALLOWLIST.includes(rel)) continue;
    if (LEGACY_DIRECT_CALL_DEBT.includes(rel)) {
      knownDebt.push(rel);
    } else {
      violations.push(rel);
    }
  }

  return { violations, knownDebt };
}

/** CREATE TABLE names that would constitute a prohibited duplicate approval artefact. */
const PROHIBITED_APPROVAL_TABLES = [
  'approved_financial_model_versions',
  'approved_model_versions',
  'filing_engine_approvals',
  'approved_financial_models',
];

/** The canonical, already-existing approval spine the engine must reuse. */
export const CANONICAL_APPROVAL_TABLES = [
  'filing_approvals',
  'filing_model_snapshots',
];

function createsTable(sql: string, table: string): boolean {
  const re = new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?(public\\.)?${table}\\b`, 'i');
  return re.test(sql);
}

export interface ApprovalArtefactReport {
  duplicates: string[];
  canonicalPresent: string[];
  canonicalMissing: string[];
}

/**
 * Assert no duplicate approval artefact was introduced, and that the canonical
 * approval tables still exist (so the engine has something to consume).
 */
export function auditApprovalArtefacts(migrationContents: string[]): ApprovalArtefactReport {
  const all = migrationContents.join('\n');
  const duplicates = PROHIBITED_APPROVAL_TABLES.filter((t) => createsTable(all, t));
  const canonicalPresent = CANONICAL_APPROVAL_TABLES.filter((t) => createsTable(all, t));
  const canonicalMissing = CANONICAL_APPROVAL_TABLES.filter((t) => !createsTable(all, t));
  return { duplicates, canonicalPresent, canonicalMissing };
}
