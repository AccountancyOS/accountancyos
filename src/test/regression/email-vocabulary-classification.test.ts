import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guards on London increment 001 — email_queue vocabulary reconciliation and sender classification.
 *
 * The defect this migration fixed was invisible for a long time because it broke the WRITERS
 * rather than the readers: `email_queue_status_check` permits only pending|sent|failed|cancelled,
 * several functions wrote values outside it, every such statement raised 23514 and rolled back its
 * whole transaction, and the visible symptom was simply an empty table. Compose Email, records
 * requests and failure-dismissal were all non-functional.
 *
 * Two things must not regress:
 *
 * 1. **The status vocabulary must not be widened.** Admitting the retired synonyms would convert
 *    three loud 23514 errors into three silent never-drains, because the drainer picks up on
 *    `status='pending'` — rows carrying a retired value would persist and sit in the queue
 *    forever, invisible. Loud beats silent.
 * 2. **`context='system'` must stay unreachable from the user-callable RPC.** It is what makes
 *    process-email-queue send through Postmark as AccountancyOS instead of the practice's own
 *    mailbox. Sender identity is a security boundary, not a formatting choice.
 */
const root = resolve(__dirname, "../../../");
const MIGRATION = resolve(
  root,
  "docs/migration/london-increments/001_email_vocabulary_and_sender_classification.sql",
);

const sql = existsSync(MIGRATION) ? readFileSync(MIGRATION, "utf8") : "";

/** The four values `email_queue_status_check` permits. */
const CANONICAL_STATUSES = ["pending", "sent", "failed", "cancelled"];
/** Synonyms deliberately collapsed into the four above. */
const RETIRED_STATUSES = ["queued", "draft", "ignored"];

describe("London increment 001 — exists and is placed correctly", () => {
  it("is present in the London-only staging directory", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    expect(sql.length).toBeGreaterThan(0);
  });

  it("declares itself London-only so it is never applied to the legacy project", () => {
    expect(sql).toMatch(/LONDON ONLY/);
  });
});

describe("status vocabulary — collapsed, not widened", () => {
  it("does not add any retired status value to the constraint", () => {
    // The migration must never contain an ALTER that re-admits a retired value.
    const alterations = sql
      .split("\n")
      .filter((l) => /ALTER TABLE.*email_queue|email_queue_status_check/i.test(l))
      .filter((l) => !l.trim().startsWith("--"));
    for (const line of alterations) {
      for (const retired of RETIRED_STATUSES) {
        expect(
          line.includes(`'${retired}'`) && /ADD CONSTRAINT|CHECK/i.test(line),
          `increment 001 must not widen email_queue_status_check to admit '${retired}': ${line}`,
        ).toBe(false);
      }
    }
  });

  it("refuses to run if the constraint was widened out of band", () => {
    // A precondition, not a comment: if someone admitted the retired values elsewhere, the whole
    // premise of collapsing them is wrong and this migration must stop rather than encode a stale
    // assumption.
    expect(sql).toMatch(/email_queue_status_check widened out of band/);
  });

  it("assigns the canonical pending status in queue_email_safe", () => {
    expect(sql).toMatch(/v_status := 'pending';/);
  });

  it("no longer derives status from the retired two-value CASE", () => {
    expect(sql).not.toMatch(/v_status := CASE WHEN p_scheduled_at IS NULL/);
  });

  it("represents a draft as an unscheduled pending row rather than a fifth status", () => {
    // The drainer's `.lte('scheduled_at', now)` never matches NULL, so an unscheduled row is
    // structurally unsendable. That is what makes a draft a draft — no new status needed.
    expect(sql).toMatch(/v_is_draft := \(p_scheduled_at IS NULL\);/);
  });

  it("keeps the flush predicate excluding NULL so a flush cannot sweep drafts into the outbox", () => {
    expect(sql).toMatch(/AND scheduled_at > now\(\)/);
  });
});

describe("sender identity — system is unreachable from the user-callable RPC", () => {
  it("rejects context='system' in queue_email_safe", () => {
    expect(sql).toMatch(/IF p_context = 'system' THEN/);
    expect(sql).toMatch(/user-composed email cannot be sent as AccountancyOS system mail/);
  });

  it("does not offer 'system' among the accepted context values", () => {
    const accepted = sql.match(/p_context NOT IN \(([^)]*)\)/);
    expect(accepted, "queue_email_safe must validate p_context against an explicit list").not.toBeNull();
    expect(accepted![1]).not.toContain("'system'");
  });

  it("defaults the context to a practice-mailbox value, never a Postmark one", () => {
    // If a caller forgets to classify, the failure mode must be 'held until a mailbox exists',
    // never 'sent from AccountancyOS's domain as if it were the practice'.
    expect(sql).toMatch(/p_context text DEFAULT 'general'::text/);
  });
});

describe("sender classification — each writer declares who it is writing as", () => {
  const CLASSIFICATIONS: Array<[string, string]> = [
    // Staff-facing platform notification, addressed to AccountancyOS login addresses → Postmark.
    ["public_submit_onboarding_for_review", "system"],
    // Client-facing practice correspondence → the practice's own mailbox.
    ["send_onboarding_questionnaire", "onboarding"],
    ["lifecycle_approve_onboarding", "job"],
  ];

  it.each(CLASSIFICATIONS)("classifies %s as '%s'", (fn, context) => {
    const idx = sql.indexOf(fn);
    expect(idx, `${fn} should appear in increment 001`).toBeGreaterThan(-1);
    expect(sql).toContain(`'${context}'`);
  });

  it("adds the context column to every INSERT it classifies", () => {
    expect(sql).toMatch(/merge_data, status, context/);
    expect(sql).toMatch(/entity_type, entity_id, merge_data, status, context/);
  });
});

describe("trigger_records_request — the two-vocabulary trap", () => {
  it("rewrites only the email_queue context, never the questionnaire_type literal", () => {
    // 'records_request' appears twice in that body. The first is
    // job_questionnaire_instances.questionnaire_type — a different column on a different table
    // with its own vocabulary. Rewriting it would silently corrupt questionnaire routing.
    expect(sql).toMatch(/v_job\.company_id,\n\s*'records_request',/);
    expect(sql).toMatch(/questionnaire_type literal was damaged/);
  });

  it("asserts exactly one records_request literal survives", () => {
    expect(sql).toMatch(/expected exactly 1 remaining records_request literal/);
  });
});

describe("queue_email_safe — signature change is unambiguous", () => {
  it("drops the old signature before creating the new one, in the same transaction", () => {
    const dropIdx = sql.indexOf("DROP FUNCTION IF EXISTS public.queue_email_safe");
    const createIdx = sql.indexOf("CREATE FUNCTION public.queue_email_safe");
    expect(dropIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(dropIdx);
    // Both must sit inside the single BEGIN/COMMIT, so there is no window with neither form
    // present and no possibility of two overloads coexisting (the DEF-002 ambiguity class).
    expect(sql.indexOf("BEGIN;")).toBeLessThan(dropIdx);
    expect(sql.lastIndexOf("COMMIT;")).toBeGreaterThan(createIdx);
  });

  it("asserts exactly one overload survives", () => {
    expect(sql).toMatch(/expected exactly 1 queue_email_safe overload/);
  });

  it("re-issues the grants that DROP removed", () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.queue_email_safe[^;]*TO authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.queue_email_safe[^;]*TO service_role;/);
  });

  it("records that omitting a grant does NOT narrow the ACL", () => {
    // Verified against the live database after apply: Supabase's default privileges re-grant
    // PUBLIC/anon on CREATE, so the resulting ACL was byte-identical to the pre-existing one.
    // Anyone reading this migration must not conclude that a grant was successfully removed.
    expect(sql).toMatch(/VERIFIED AFTER APPLY/);
    expect(sql).toMatch(/Narrowing requires an explicit REVOKE/);
  });
});

describe("canonical status set is stated once and consistently", () => {
  it("checks all four permitted values as a precondition", () => {
    for (const status of CANONICAL_STATUSES) {
      expect(sql, `precondition should assert '${status}' is permitted`).toContain(`''${status}''`);
    }
  });
});
