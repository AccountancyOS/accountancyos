import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DEF-003 (reopened 2026-08-17) — the email-queue drain, and the manifest that is supposed
 * to notice when it disappears.
 *
 * `process-email-queue` has now vanished from `cron.job` on production four times
 * (20260620165236, 20260624101545, the absence repaired by 20260805100000, and again some
 * time after 20260806083238 committed with a post-assert proving it present). Nothing in the
 * product reports it. The queue simply stops draining and every enqueued message — proposals,
 * engagement letters, portal invites, password resets — sits forever.
 *
 * `scripts/smoke-test.ts::checkCronJobs` is the detector and it was already correct:
 * `process-email-queue` is marked `critical` in the manifest, and a missing critical job
 * fails the run. It had simply not been run.
 *
 * What was NOT correct was the rest of that manifest. On 2026-08-17 five of its eight entries
 * named jobs that do not exist under those names on production (`chaser-tick` vs the live
 * `chaser-tick-every-15min`, `sla-check` and `session-cleanup` not present at all), and seven
 * live jobs were absent from it entirely. A detector that checks for the wrong names is not a
 * detector. These guards keep the manifest and the migrations describing the same estate, in
 * CI, without needing database access.
 */
const root = resolve(__dirname, "../../../");
const MIG_NAME = "20260817100000_def_003_reinstate_email_queue_drain.sql";
const MIG = readFileSync(resolve(root, `supabase/migrations/${MIG_NAME}`), "utf8");
const CODE = MIG.replace(/^\s*--.*$/gm, "");

const manifest = JSON.parse(
  readFileSync(resolve(root, "infra/supabase-manifest.json"), "utf8"),
) as { cronJobs: Array<{ name: string; expectedSchedule: string; critical?: boolean }> };

describe("DEF-003 — the migration reinstates exactly one job, safely", () => {
  it("schedules process-email-queue and nothing else", () => {
    const scheduled = [...CODE.matchAll(/cron\.schedule\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(scheduled).toEqual(["process-email-queue"]);
  });

  it("never unschedules — cron.schedule upserts, so the jobid is preserved", () => {
    expect(CODE).not.toMatch(/cron\.unschedule/i);
  });

  it("does not reintroduce the DEF-018 GUC pattern", () => {
    // Scoped to the scheduled command body. The migration mentions `app.settings.` elsewhere
    // on purpose — as a LIKE guard that refuses to apply if any job has reacquired it — and
    // asserting over the whole file would flag that guard as if it were the defect.
    const body = CODE.match(/\$cron\$([\s\S]*?)\$cron\$/);
    expect(body).not.toBeNull();
    expect(body![1]).not.toMatch(/app\.settings\./);
  });

  it("reads its credential from the vault rather than embedding one", () => {
    expect(CODE).toMatch(/vault\.decrypted_secrets/);
    // An embedded JWT would be a credential committed to git.
    expect(CODE).not.toMatch(/eyJhbGciOi/);
  });

  it("refuses to schedule when the vault secret is missing", () => {
    // A job that runs every minute and 401s every minute manufactures the appearance of a
    // working drain, which is worse than no job at all.
    expect(CODE).toMatch(/DEF-003 precondition failed: vault secret/);
  });

  it("is self-verifying — a partial apply aborts the transaction", () => {
    expect(CODE).toMatch(/^BEGIN;/m);
    expect(CODE).toMatch(/^COMMIT;/m);
    expect(CODE).toMatch(/DEF-003 post-assert failed: process-email-queue is absent after scheduling/);
    expect(CODE).toMatch(/DEF-003 post-assert failed: process-email-queue exists but is not active/);
  });

  it("touches no schema object", () => {
    expect(CODE).not.toMatch(/\bCREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|TABLE|VIEW|TRIGGER|POLICY|INDEX)\b/i);
    expect(CODE).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(CODE).not.toMatch(/\bDROP\s+/i);
    expect(CODE).not.toMatch(/\bGRANT\b/i);
  });
});

describe("DEF-003 — the manifest describes the real cron estate", () => {
  it("still marks the email drain critical, so its absence fails a smoke run", () => {
    const drain = manifest.cronJobs.find((j) => j.name === "process-email-queue");
    expect(drain).toBeDefined();
    expect(drain!.critical).toBe(true);
  });

  it("gives the drain the cadence the migration actually schedules", () => {
    const drain = manifest.cronJobs.find((j) => j.name === "process-email-queue")!;
    const scheduled = CODE.match(/cron\.schedule\(\s*'process-email-queue',\s*'([^']+)'/);
    expect(scheduled).not.toBeNull();
    expect(drain.expectedSchedule).toBe(scheduled![1]);
  });

  /**
   * Jobs that exist on production but that NO migration in this repository schedules.
   * Established 2026-08-17 by comparing a live `catalog_cron` read against every
   * `cron.schedule(...)` call in `supabase/migrations/`.
   *
   * They were created out of band — the Lovable dashboard, most likely — and are therefore
   * DEF-020 evidence: production cron state that git does not describe and cannot reproduce.
   * If this database were rebuilt from migrations alone, these five jobs would not exist and
   * chaser sends, dormant-lead scanning, overdue-invoice scanning and the hourly TrueLayer
   * sync would all silently not run.
   *
   * This list is a record of a known gap, not an approval of it. It must SHRINK — each entry
   * is removed when a migration is authored that schedules that job. Nothing may be added
   * here without the same evidence.
   */
  const SCHEDULED_OUTSIDE_GIT = [
    "chaser-tick-every-15min",
    "chaser-trigger-scan-every-6h",
    "dormant-lead-scan-daily",
    "invoice-overdue-scan-daily",
    "truelayer-sync-hourly",
  ];

  it("lists no job that no migration ever schedules, beyond the known out-of-git set", () => {
    // The failure mode this catches: `sla-check` and `session-cleanup` sat in the manifest
    // for months while existing nowhere, so the smoke test reported them missing forever and
    // the noise trained the signal out.
    const migDir = resolve(root, "supabase/migrations");
    const allSql = readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(resolve(migDir, f), "utf8"))
      .join("\n");
    const everScheduled = new Set(
      [...allSql.matchAll(/cron\.schedule\(\s*'([^']+)'/g)].map((m) => m[1]),
    );
    const orphans = manifest.cronJobs
      .map((j) => j.name)
      .filter((n) => !everScheduled.has(n) && !SCHEDULED_OUTSIDE_GIT.includes(n));
    expect(orphans).toEqual([]);
  });

  it("keeps the out-of-git list honest — an entry a migration now schedules must be removed", () => {
    const migDir = resolve(root, "supabase/migrations");
    const allSql = readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(resolve(migDir, f), "utf8"))
      .join("\n");
    const everScheduled = new Set(
      [...allSql.matchAll(/cron\.schedule\(\s*'([^']+)'/g)].map((m) => m[1]),
    );
    const nowInGit = SCHEDULED_OUTSIDE_GIT.filter((n) => everScheduled.has(n));
    expect(nowInGit).toEqual([]);
  });

  it("has no duplicate entries", () => {
    const names = manifest.cronJobs.map((j) => j.name);
    expect(names.length).toBe(new Set(names).size);
  });
});
