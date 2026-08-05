import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DEF-018 + DEF-003 — six cron jobs failed on every run, and the email drain was
 * never scheduled at all.
 *
 * The six built their request from current_setting('app.settings.supabase_url') and
 * ('app.settings.service_role_key'). Neither GUC exists, so current_setting raised
 * 42704 before net.http_post was ever reached — 26,208 consecutive failures in the
 * audited week, none of which surfaced anywhere in the product.
 *
 * DEF-003 is the same defect wearing a different hat: the migration that would have
 * scheduled process-email-queue was authored on 2026-07-20, never applied, and used
 * the identical broken pattern.
 *
 * These are static guards over the migration. The behavioural half — that the jobs
 * now produce 2xx HTTP responses rather than merely successful SQL — cannot be
 * checked from here (cron.job_run_details and net._http_response are outside the
 * public schema) and is delegated to the executor in the receipt.
 */
const root = resolve(__dirname, "../../../");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const MIG_NAME = "20260805100000_def_018_003_cron_guc_repair.sql";
const MIG = read(`supabase/migrations/${MIG_NAME}`);

/** Comments carry the defect string deliberately; guards must run on executable SQL. */
const CODE = MIG.replace(/^\s*--.*$/gm, "");

/** The bodies actually installed into cron.job — everything between $cron$ … $cron$. */
const CRON_BODIES = [...CODE.matchAll(/\$cron\$([\s\S]*?)\$cron\$/g)].map((m) => m[1]);

const REPAIRED = [
  "hmrc-ct-poll-worker",
  "hmrc-ct-delete-worker",
  "sync-gmail-emails",
  "sync-outlook-emails",
  "process-automation-events",
  "workflow-tick",
];
const ALL_JOBS = [...REPAIRED, "process-email-queue"];

/** Job name → the edge function it actually targets. Two do not match their job name. */
const TARGETS: Record<string, string> = {
  "hmrc-ct-poll-worker": "hmrc-ct-poll",
  "hmrc-ct-delete-worker": "hmrc-ct-delete",
  "sync-gmail-emails": "gmail-sync",
  "sync-outlook-emails": "outlook-sync",
  "process-automation-events": "process-automation-events",
  "workflow-tick": "workflow-tick",
  "process-email-queue": "process-email-queue",
};

const SCHEDULES: Record<string, string> = {
  "hmrc-ct-poll-worker": "* * * * *",
  "hmrc-ct-delete-worker": "*/5 * * * *",
  "sync-gmail-emails": "*/2 * * * *",
  "sync-outlook-emails": "*/2 * * * *",
  "process-automation-events": "*/5 * * * *",
  "workflow-tick": "*/5 * * * *",
  "process-email-queue": "* * * * *",
};

describe("DEF-018 — the detector catches the real defect", () => {
  /**
   * Guard-quality check. This is the exact command body live on 2026-08-05 for
   * workflow-tick. If the detector below did not match it, these tests would be
   * passing on the fix without ever having been able to see the defect.
   */
  const LIVE_BROKEN = `
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/workflow-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  `;

  const hasGucPattern = (sql: string) => /current_setting\(\s*'app\.settings\./.test(sql);

  it("matches the live broken body", () => {
    expect(hasGucPattern(LIVE_BROKEN)).toBe(true);
  });

  it("does not match a repaired body", () => {
    expect(CRON_BODIES.length).toBeGreaterThan(0);
    for (const body of CRON_BODIES) {
      expect(hasGucPattern(body)).toBe(false);
    }
  });
});

describe("DEF-018 — the repair", () => {
  it("schedules every one of the seven jobs exactly once", () => {
    for (const job of ALL_JOBS) {
      const scheduled = CODE.match(new RegExp(`cron\\.schedule\\(\\s*'${job}'`, "g")) ?? [];
      expect(scheduled, `${job} must be scheduled exactly once`).toHaveLength(1);
    }
    expect(CODE.match(/cron\.schedule\(/g)).toHaveLength(ALL_JOBS.length);
  });

  it("preserves each job's original cadence", () => {
    for (const [job, sched] of Object.entries(SCHEDULES)) {
      const m = new RegExp(`cron\\.schedule\\(\\s*'${job}',\\s*'${sched.replace(/\*/g, "\\*")}'`).test(CODE);
      expect(m, `${job} must keep the schedule ${sched}`).toBe(true);
    }
  });

  it("targets the correct edge function for each job, including the two that differ from their name", () => {
    for (const [job, fn] of Object.entries(TARGETS)) {
      const body = CRON_BODIES.find((b) => b.includes(`/functions/v1/${fn}`));
      expect(body, `${job} must target /functions/v1/${fn}`).toBeDefined();
    }
    // The trap: these two job names do not match their function names.
    expect(CODE).toContain("/functions/v1/gmail-sync");
    expect(CODE).toContain("/functions/v1/outlook-sync");
    expect(CODE).not.toContain("/functions/v1/sync-gmail-emails");
    expect(CODE).not.toContain("/functions/v1/sync-outlook-emails");
  });

  it("reads every credential from vault, never from a GUC or a literal", () => {
    for (const body of CRON_BODIES) {
      expect(body).toMatch(/vault\.decrypted_secrets/);
      expect(body).toMatch(/name = 'email_queue_service_role_key'/);
    }
  });

  it("never commits a credential to git", () => {
    // A JWT literal (the shape of a Supabase anon/service key) must not appear.
    expect(CODE).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
    // Nor a GUC assignment that would put one into database settings.
    expect(CODE).not.toMatch(/ALTER\s+(DATABASE|SYSTEM|ROLE)/i);
    expect(CODE).not.toMatch(/service_role_key\s*=\s*'/);
  });
});

describe("DEF-018 — fails loudly rather than scheduling dead jobs", () => {
  const PRE = CODE.slice(0, CODE.indexOf("cron.schedule("));

  it("aborts when the vault secret is missing or empty", () => {
    expect(PRE).toMatch(/RAISE EXCEPTION/);
    expect(PRE).toMatch(/length\(btrim\(v_secret\)\) = 0|v_secret IS NULL/);
  });

  it("does not merely warn, as the prior art did", () => {
    // 20260630221547 raises WARNING then schedules anyway — the exact Gate 6 failure
    // mode this release exists to stop repeating.
    const secretGuard = PRE.slice(PRE.indexOf("email_queue_service_role_key"));
    expect(secretGuard).toMatch(/RAISE EXCEPTION/);
    expect(secretGuard).not.toMatch(/RAISE WARNING/);
  });

  it("reproduces the failure before repairing it", () => {
    expect(PRE).toMatch(/app\.settings\./);
    expect(PRE).toMatch(/Refusing to rewrite job bodies that are not broken/);
  });

  it("requires both extensions to be present", () => {
    expect(PRE).toMatch(/extname = 'pg_cron'/);
    expect(PRE).toMatch(/extname = 'pg_net'/);
  });

  it("aborts if any of the six audited jobs has gone missing", () => {
    expect(PRE).toMatch(/expected cron job\(s\) not present/);
  });
});

describe("DEF-003 — the email drain", () => {
  it("schedules process-email-queue every minute", () => {
    expect(CODE).toMatch(/cron\.schedule\(\s*'process-email-queue',\s*'\* \* \* \* \*'/);
  });

  it("keeps the backlog volume bound from the superseded migration", () => {
    expect(CODE).toMatch(/v_threshold constant int := 200/);
    expect(CODE).toMatch(/RAISE EXCEPTION[\s\S]{0,200}would all send/);
  });

  it("cancels reserved-TLD mail rather than deleting it", () => {
    expect(CODE).toMatch(/SET status\s*=\s*'cancelled'/);
    expect(CODE).not.toMatch(/DELETE FROM public\.email_queue/);
    for (const tld of [".test", ".example", ".invalid", ".localhost"]) {
      expect(CODE).toContain(`%${tld}'`);
    }
    // The reason must be recorded on the row, not just in this file.
    expect(CODE).toMatch(/error_message\s*=\s*'Cancelled by DEF-003 repair/);
  });

  it("supersedes rather than re-applies the broken 2026-07-20 migration", () => {
    const superseded = "supabase/migrations/20260720120000_schedule_process_email_queue.sql";
    if (existsSync(resolve(root, superseded))) {
      // If it is still in the tree it must remain unapplied and be recorded as superseded,
      // because applying it would re-create the job with the GUC defect.
      const receipt = read("docs/releases/pending/2026-08-05-def-018-003-cron-guc-repair.json");
      expect(receipt).toContain("20260720120000_schedule_process_email_queue.sql");
      expect(JSON.parse(receipt).supersedes).toMatch(/must not be applied/);
    }
  });
});

describe("DEF-018/003 — transaction and self-verification", () => {
  it("is exactly one top-level transaction", () => {
    expect(MIG.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(MIG.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(MIG.indexOf("BEGIN;")).toBeLessThan(MIG.indexOf("cron.schedule("));
    expect(MIG.lastIndexOf("COMMIT;")).toBeGreaterThan(MIG.lastIndexOf("cron.schedule("));
  });

  it("asserts its own end state for all seven jobs before committing", () => {
    const POST = CODE.slice(CODE.lastIndexOf("cron.schedule("));
    expect(POST).toMatch(/post-assert failed/);
    expect(POST).toMatch(/still references app\.settings/);
    expect(POST).toMatch(/does not read its credential from vault/);
    expect(POST).toMatch(/is not active/);
    expect(POST).toMatch(/has schedule/);
    for (const job of ALL_JOBS) {
      expect(POST, `${job} must be in the post-assertion list`).toContain(job);
    }
  });

  it("asserts the already-healthy jobs survived", () => {
    expect(CODE).toMatch(/at least 13 cron jobs/);
  });

  it("touches no table, function, policy, trigger or grant", () => {
    expect(CODE).not.toMatch(/CREATE (OR REPLACE )?FUNCTION|DROP FUNCTION/);
    expect(CODE).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/);
    expect(CODE).not.toMatch(/CREATE POLICY|DROP POLICY/);
    expect(CODE).not.toMatch(/CREATE TRIGGER|DROP TRIGGER/);
    expect(CODE).not.toMatch(/\bGRANT\b|\bREVOKE\b/);
  });

  it("changes email_queue only by cancelling undeliverable rows", () => {
    const updates = CODE.match(/UPDATE public\.email_queue/g) ?? [];
    expect(updates).toHaveLength(1);
  });
});
