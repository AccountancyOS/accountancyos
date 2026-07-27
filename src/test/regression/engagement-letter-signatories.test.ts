import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Phase 2 Task 2a — additive signatories foundation.
 *
 * Static-content guard (mirrors job-creation-single-source.test.ts). Asserts the
 * migration set introduces the `engagement_letter_signatories` model, the
 * `engagement_letters.signing_rule` column + CHECK, and the signed-row
 * immutability trigger (the EL protect_engagement_letter_signatures pattern) —
 * and that the app vocabulary knows the forthcoming `partially_signed` token.
 *
 * ADDITIVE only: this task must not touch any signing RPC, gate, or UI, so we
 * only assert the new objects exist, never that any existing one changed.
 */
const root = resolve(__dirname, "../../../");

const migDir = resolve(root, "supabase/migrations");
const migAll = readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(migDir, f), "utf8"))
  .join("\n");

const checkConstants = readFileSync(
  resolve(root, "src/lib/db-constants/check-constraints.ts"),
  "utf8",
);

describe("engagement_letter_signatories foundation (Phase 2 T2a)", () => {
  it("defines the engagement_letter_signatories table (additive/idempotent)", () => {
    expect(migAll).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.engagement_letter_signatories/,
    );
    // FK to engagement_letters, cascade-deleted with the parent letter.
    expect(migAll).toMatch(
      /engagement_letter_id[\s\S]*?REFERENCES public\.engagement_letters\s*\(id\)\s*ON DELETE CASCADE/,
    );
    // signer_email is the only mandatory signer identity field.
    expect(migAll).toMatch(/signer_email\s+text\s+NOT NULL/);
    // Signing rule support columns.
    expect(migAll).toMatch(/signature_token\s+uuid/);
    expect(migAll).toMatch(/required\s+boolean\s+NOT NULL\s+DEFAULT\s+true/);
  });

  it("enables RLS and mirrors the engagement_letters org-scoped policies", () => {
    expect(migAll).toMatch(
      /ALTER TABLE public\.engagement_letter_signatories\s+ENABLE ROW LEVEL SECURITY/,
    );
    // Org-scoped read + manager-gated write, mirroring engagement_letters.
    expect(migAll).toMatch(/user_has_organization_access\(organization_id\)/);
    expect(migAll).toMatch(
      /user_has_role_at_least\(auth\.uid\(\),\s*organization_id,\s*'manager'/,
    );
  });

  it("adds engagement_letters.signing_rule with a guarded ('all','any') CHECK", () => {
    expect(migAll).toMatch(
      /ALTER TABLE public\.engagement_letters\s+ADD COLUMN IF NOT EXISTS signing_rule text NOT NULL DEFAULT 'all'/,
    );
    expect(migAll).toMatch(
      /signing_rule IN \(\s*'all'\s*,\s*'any'\s*\)/,
    );
  });

  it("mirrors the EL immutability pattern with a BEFORE UPDATE trigger on signed rows", () => {
    // Function name + the once-signed guard on the signature fields.
    expect(migAll).toMatch(
      /FUNCTION public\.protect_signatory_signature\(\)/,
    );
    expect(migAll).toMatch(/OLD\.signed_at IS NOT NULL/);
    // BEFORE UPDATE trigger wired onto the new table.
    expect(migAll).toMatch(
      /CREATE TRIGGER[\s\S]*?BEFORE UPDATE ON public\.engagement_letter_signatories[\s\S]*?protect_signatory_signature/,
    );
  });

  it("check-constraints.ts additively knows the 'partially_signed' token", () => {
    expect(checkConstants).toMatch(/partially_signed/);
    // QUOTE_STATUSES stays the untouched SSOT mirror of the live quotes_status_check.
    expect(checkConstants).toMatch(
      /QUOTE_STATUSES = \["draft", "sent", "accepted", "rejected", "expired", "superseded"\]/,
    );
  });
});
