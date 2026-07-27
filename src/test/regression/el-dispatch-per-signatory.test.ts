import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Phase 2 Task 2d-3 — per-signatory dispatch + the client-facing signing page.
 *
 * Static-content guard over the three app-side files that complete the multi-signatory
 * journey. The invariants frozen here are the ones whose regression would silently break
 * a client's ability to sign (or let them sign the wrong thing):
 *   - each signatory is emailed their OWN token, deduped per signatory;
 *   - the letter has real wording before anyone is asked to sign it, built by the
 *     existing single builder rather than a second copy;
 *   - the public page reads/writes only through the SECURITY DEFINER RPCs;
 *   - letters with no signatory snapshot keep the legacy single-recipient behaviour.
 */
const root = resolve(__dirname, "../../../");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const DISPATCH = read("supabase/functions/send-engagement-letter/index.ts");
const PAGE = read("src/pages/EngagementLetterPreview.tsx");
const SECTION = read("src/components/onboarding/EngagementLetterSection.tsx");

describe("per-signatory engagement-letter dispatch (Phase 2 T2d-3)", () => {
  it("seeds signatories from the proposal's snapshot, idempotently", () => {
    expect(DISPATCH).toMatch(/from\('quotes'\)[\s\S]*?select\('signatory_snapshot'\)/);
    expect(DISPATCH).toMatch(/from\('engagement_letter_signatories'\)[\s\S]*?\.insert\(toInsert\)/);
    // Only emails not already present are inserted — a resend never re-issues a token
    // a client already holds.
    expect(DISPATCH).toMatch(/filter\(\(s\) => !existingByEmail\.has\(normaliseEmail\(s\.email\)\)\)/);
  });

  it("emails each signatory their own link and never dedups co-signers", () => {
    // The signing URL carries the recipient's own token, not the letter token.
    expect(DISPATCH).toMatch(/\/engagement\/\$\{to\.token\}/);
    // Idempotency key includes the signatory id, so two co-signers on the same day are
    // two separate emails rather than one deduped send.
    expect(DISPATCH).toMatch(
      /engagement-letter:\$\{body\.engagement_letter_id\}:\$\{to\.signatoryId\}:\$\{today\}/,
    );
    // Signed signatories are not chased again.
    expect(DISPATCH).toMatch(/filter\(\(r\) => !r\.signed_at && r\.signature_token\)/);
  });

  it("removes only unsigned signatories dropped from the proposal", () => {
    expect(DISPATCH).toMatch(/!r\.signed_at && !snapshotEmails\.has\(normaliseEmail\(r\.signer_email\)\)/);
    // A recorded signature is never deleted.
    expect(DISPATCH).toMatch(/\.delete\(\)\s*\.in\('id', staleIds\)/);
  });

  it("gives the letter real wording before sending, via the existing builder", () => {
    expect(DISPATCH).toMatch(/if \(!letter\.document_content && !letter\.signed_at\)/);
    expect(DISPATCH).toMatch(/rpc\(\s*'public_preview_engagement_letter'/);
    // Refuses to send rather than emailing a link to a blank document.
    expect(DISPATCH).toMatch(/Could not generate the engagement letter wording/);
    // No second copy of the letter wording lives in the edge function.
    expect(DISPATCH).not.toMatch(/Scope of Services/);
  });

  it("keeps the legacy single-recipient path for letters with no snapshot", () => {
    expect(DISPATCH).toMatch(/token: letter\.signature_token,\s*signatoryId: null/);
    expect(DISPATCH).toMatch(/engagement-letter:\$\{body\.engagement_letter_id\}:\$\{today\}/);
  });
});

describe("public signing page reads through RPCs (Phase 2 T2d-3)", () => {
  it("loads and signs only via the SECURITY DEFINER RPCs", () => {
    expect(PAGE).toMatch(/"public_get_engagement_letter_for_signing"/);
    expect(PAGE).toMatch(/"public_sign_engagement_letter_as_signatory"/);
    // Legacy letter-level links still work from the same page.
    expect(PAGE).toMatch(/"public_sign_engagement_letter_by_token"/);
  });

  it("never queries the RLS-protected tables directly", () => {
    // The defect this replaced: anon has no SELECT policy on either table, so these
    // reads returned nothing and the page rendered "link is invalid".
    expect(PAGE).not.toMatch(/from\("engagement_letters"\)/);
    expect(PAGE).not.toMatch(/from\("organizations"\)/);
  });

  it("tells a signatory where they stand instead of just 'signed'", () => {
    expect(PAGE).toMatch(/signatories have signed/);
    expect(PAGE).toMatch(/waiting on the other signatories/);
    // A shared link on a per-signatory letter gets guidance, not a dead Sign button.
    expect(PAGE).toMatch(/requires_personal_link/);
  });
});

describe("staff-side signatory visibility (Phase 2 T2d-3)", () => {
  it("shows who has signed and who is outstanding", () => {
    expect(SECTION).toMatch(/from\("engagement_letter_signatories"\)/);
    expect(SECTION).toMatch(/partially_signed/);
    expect(SECTION).toMatch(/Awaiting signature/);
  });

  it("evaluates the same rule the activation gate uses", () => {
    // required-only, and 'any' => at least one — mirroring el_signature_progress.
    expect(SECTION).toMatch(/signatories\.filter\(\(s\) => s\.required\)/);
    expect(SECTION).toMatch(/signing_rule === "any"/);
  });
});
