import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * G2 — source-structure guard for the transactional onboarding-approval merge RPC.
 *
 * There is no local Postgres/Deno runtime, so the RPC is verified by asserting the
 * SHAPE of its migration source (mirrors job-creation-single-source.test.ts and
 * onboarding-token-threading.test.ts). The security-critical invariant this locks:
 * the new RPC CALLS the single effective `lifecycle_approve_onboarding`, it never
 * re-implements it (that function has a history of near-duplicate copies).
 */
const root = resolve(__dirname, "../../../");
const MIGRATION = readFileSync(
  resolve(
    root,
    "supabase/migrations/20260722150000_approve_onboarding_transactional.sql",
  ),
  "utf8",
);

describe("approve_onboarding_transactional migration structure", () => {
  it("defines the transactional merge RPC with the SECURITY DEFINER + search_path guards", () => {
    expect(MIGRATION).toMatch(
      /CREATE OR REPLACE FUNCTION public\.approve_onboarding_transactional\s*\(/,
    );
    expect(MIGRATION).toMatch(/SECURITY DEFINER/);
    expect(MIGRATION).toMatch(/SET search_path TO 'public',\s*'extensions'/);
  });

  it("CALLS lifecycle_approve_onboarding and never re-implements it", () => {
    // Calls the core (SELECT ... INTO).
    expect(MIGRATION).toMatch(
      /(SELECT|PERFORM)[\s\S]{0,80}lifecycle_approve_onboarding\s*\(\s*p_application_id/,
    );
    // Must NOT contain a second definition of the core function (no duplicate copy).
    expect(MIGRATION).not.toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION[\s\S]{0,120}lifecycle_approve_onboarding/,
    );
  });

  it("self-guards with user_has_organization_access", () => {
    expect(MIGRATION).toMatch(/user_has_organization_access\s*\(/);
  });

  it("has an inner EXCEPTION WHEN OTHERS handler that records approval_blocked_reason", () => {
    expect(MIGRATION).toMatch(/EXCEPTION\s+WHEN\s+OTHERS\s+THEN/);
    expect(MIGRATION).toMatch(/approval_blocked_reason\s*=\s*left\s*\(\s*SQLERRM/);
    expect(MIGRATION).toMatch(/approval_blocked_at\s*=\s*now\(\)/);
  });

  it("writes governance state, audit and the immutable snapshot", () => {
    expect(MIGRATION).toMatch(/INSERT INTO\s+(public\.)?onboarding_approval_snapshots/);
    expect(MIGRATION).toMatch(/INSERT INTO\s+(public\.)?data_audit_log/);
    expect(MIGRATION).toMatch(/INSERT INTO\s+(public\.)?data_point_state/);
    // data_point_state upsert is idempotent (unique subject/field key).
    expect(MIGRATION).toMatch(/ON CONFLICT[\s\S]{0,120}DO UPDATE/);
  });

  it("masks audit values via governance_mask_value", () => {
    expect(MIGRATION).toMatch(
      /CREATE OR REPLACE FUNCTION public\.governance_mask_value\s*\(/,
    );
    expect(MIGRATION).toMatch(/governance_mask_value\s*\(/g);
  });

  it("governance_mask_value fails CLOSED off data_requirements (masks when sensitivity IS NULL) and sets search_path", () => {
    const fn = MIGRATION.slice(
      MIGRATION.indexOf("FUNCTION public.governance_mask_value"),
      MIGRATION.indexOf("FUNCTION public.governance_record_merge_field"),
    );
    // Sensitivity is driven from the single source of truth, the data_requirements table.
    expect(fn).toMatch(/FROM\s+public\.data_requirements/);
    expect(fn).toMatch(/sensitivity\s+INTO/);
    // Fail closed: an unknown key (NULL sensitivity) is masked, not returned raw.
    expect(fn).toMatch(/v_sens IS NULL\s+OR\s+v_sens\s*=\s*'sensitive'/);
    // search_path is pinned on the function (Minor 3).
    expect(fn).toMatch(/SET search_path TO 'public',\s*'extensions'/);
  });

  it("drives the business/snapshot ids off the core-resolved ids (coalesce with v_core), not solely v_app.company_id", () => {
    // A company/client CREATED at approval leaves v_app.company_id NULL; the merge must
    // gap-fill onto the id the core returned so the business block is not skipped.
    expect(MIGRATION).toMatch(
      /v_company_id\s*:=\s*coalesce\(\s*v_app\.company_id\s*,\s*\(v_core->>'company_id'\)::uuid/,
    );
    expect(MIGRATION).toMatch(
      /v_client_id\s*:=\s*coalesce\(\s*v_app\.client_id\s*,\s*\(v_core->>'client_id'\)::uuid/,
    );
    // The business block gates on the resolved id.
    expect(MIGRATION).toMatch(/IF v_company_id IS NOT NULL THEN/);
  });

  it("skips junk persons with no identity anchor and no name (no blank first/last row)", () => {
    expect(MIGRATION).toMatch(
      /v_name = ''[\s\S]{0,160}person_id[\s\S]{0,120}ch_officer_id[\s\S]{0,120}CONTINUE/,
    );
  });

  it("writes PAYE to paye_schemes and NEVER to a companies.paye_reference column", () => {
    expect(MIGRATION).toMatch(/INSERT INTO\s+(public\.)?paye_schemes/);
    expect(MIGRATION).not.toMatch(/companies[\s\S]{0,40}\bpaye_reference\b/);
    expect(MIGRATION).not.toMatch(/\bpaye_reference\s*=/); // no companies.paye_reference write
  });

  it("adds the additive failure-state columns idempotently", () => {
    expect(MIGRATION).toMatch(
      /ADD COLUMN IF NOT EXISTS approval_blocked_at\s+timestamptz/,
    );
    expect(MIGRATION).toMatch(
      /ADD COLUMN IF NOT EXISTS approval_blocked_reason\s+text/,
    );
  });

  it("is idempotent: returns an idempotent success when a snapshot already exists", () => {
    expect(MIGRATION).toMatch(/idempotent/);
    expect(MIGRATION).toMatch(/onboarding_approval_snapshots[\s\S]{0,200}application_id/);
  });
});

describe("verify_aml_and_approve wiring", () => {
  it("now routes approval through approve_onboarding_transactional", () => {
    expect(MIGRATION).toMatch(
      /CREATE OR REPLACE FUNCTION public\.verify_aml_and_approve\s*\(/,
    );
    expect(MIGRATION).toMatch(
      /approve_onboarding_transactional\s*\(\s*p_onboarding_id\s*,\s*auth\.uid\(\)\s*\)/,
    );
    // The old direct call to the core must be gone from the re-created wrapper body.
    const wrapper = MIGRATION.slice(
      MIGRATION.indexOf("FUNCTION public.verify_aml_and_approve"),
    );
    expect(wrapper).not.toMatch(/:=\s*lifecycle_approve_onboarding\s*\(/);
  });

  it("maps a BLOCKED (rolled-back) approval to approval_error so staff see a warning, not a success toast", () => {
    // CRITICAL: approve_onboarding_transactional RETURNS {blocked:true,reason} on a merge
    // failure (it must not re-raise). verify_aml_and_approve must detect that and surface it
    // through the same approval_error key the UI already treats as a warning.
    const wrapper = MIGRATION.slice(
      MIGRATION.indexOf("FUNCTION public.verify_aml_and_approve"),
    );
    expect(wrapper).toMatch(
      /\(v_approval->>'blocked'\)::boolean IS TRUE[\s\S]{0,300}'approval_error',\s*v_approval->>'reason'/,
    );
  });
});
