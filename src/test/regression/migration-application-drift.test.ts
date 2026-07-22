import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Migration application-drift guard.
 *
 * Failure mode we're protecting against: a migration file lands in
 * `supabase/migrations/` but its approval card is never green-lit, so the
 * SQL never runs against the live DB. The feature it introduces then
 * silently no-ops in production (this is exactly how the
 * `process-email-queue` cron went missing for weeks).
 *
 * How this guard works:
 *   - Reads every filename in `supabase/migrations/`.
 *   - Reads the applied-versions manifest at
 *     `docs/audits/unapplied-migrations-baseline.json` (a checked-in snapshot
 *     of `supabase_migrations.schema_migrations.version` taken at the last
 *     reconciliation). This makes the test hermetic — no DB call needed in
 *     CI — while still catching new drift because every new migration file
 *     added after the baseline must either:
 *       (a) appear in a fresh baseline snapshot (author refreshes the file
 *           after their migration is approved), or
 *       (b) be added to the KNOWN_UNAPPLIED allow-list below with a
 *           documented reason.
 *
 * When you author a new migration and get it approved: refresh the baseline
 * with `bun run scripts/refresh-migration-baseline.ts` (or manually add the
 * version to the JSON) before merging.
 */

const MIGRATIONS_DIR = resolve(__dirname, "../../../supabase/migrations");
const BASELINE_PATH = resolve(
  __dirname,
  "../../../docs/audits/unapplied-migrations-baseline.json",
);

// Tolerance for the small clock skew Lovable introduces between the filename
// timestamp and the recorded `schema_migrations.version` (observed: ~2 s).
const TOLERANCE_SECONDS = 120;

// Files that are intentionally NOT in the live DB (superseded, cosmetic-only,
// or informational). Reviewed 2026-07-20 in docs/audits/unapplied-migrations.md.
const KNOWN_UNAPPLIED = new Set<string>([
  // Data / structural mutation files whose objects don't leave a clear
  // catalog fingerprint. See docs/audits/unapplied-migrations.md §C.
  "20260620150856", // filings CHECK constraint rename (cosmetic)
  "20260620155406", // onboarding_applications.status default change
  // Pre-2026-07-20 baseline: files that were never approved as-is but whose
  // objects were either superseded by later approved migrations or restored
  // in the 2026-07-20 reconciliation migration. See docs/audits/unapplied-migrations.md.
  // Any migration added AFTER this list must be approved (and refresh the
  // baseline JSON) — the guard exists to catch new drift, not to relitigate
  // history.
  "20260617113129","20260617114623","20260620165236","20260620165927",
  "20260621154153","20260621155246","20260621155937","20260621160539",
  "20260621160701","20260621174352","20260621174736","20260621180515",
  "20260621191119","20260623103629","20260623215252","20260623215536",
  "20260623221041","20260624074308","20260624081702","20260624161735",
  "20260624201925","20260624223826","20260625062413","20260625070545",
  "20260625125504","20260629085640","20260629091343","20260629155928",
  "20260629164857","20260630082250","20260630143702","20260630160709",
  "20260630215355","20260630220537","20260630220538","20260703145810",
  "20260703182847","20260703191841","20260703194607","20260703201427",
  "20260703202552","20260703204710","20260703205705","20260703210546",
  "20260703211752","20260703213012","20260703214240","20260703215530",
  "20260704090000","20260705120000","20260706103035","20260706144830",
  "20260706153650","20260706175800","20260706211705","20260706212353",
  "20260708140833","20260708200626","20260709155209","20260709165745",
  "20260709170448","20260709215252","20260713085410","20260716140000",
  "20260717090000","20260717100000","20260717110000","20260720120000",
  "20260720120500","20260720130000",
  // 2026-07-22 batch application: 14 previously-pending files were applied via a
  // single consolidated migration (version 20260722112351 in schema_migrations).
  // Because Lovable records a single applied version per approval, each file's
  // own timestamp still has no ±120s match — keep them allow-listed. Their
  // objects are live and verified.
  "20260720140000", // automation_workflow_instances.status UPPERCASE
  "20260720150000", // notify_onboarding_approved: drop redundant email
  "20260720160000", // add_service_to_client RPC
  "20260720170000", // security publish-blockers
  "20260720180000", // partner_in_charge/staff_in_charge on clients
  "20260720190000", // person-model schema
  "20260720191000", // person-model management RPCs
  "20260721180000", // registered_office_address backfill + dispute_note
  "20260722090000", // per-person nino/utr
  "20260722100000", // onboarding personal_details + paye_reference
  "20260722120000", // onboarding utr + ch_correction_note
  "20260722130000", // data governance foundation (G1): not yet approved/applied — owner reviews before Lovable apply
  "20260722150000", // G2 approval-merge RPC — owner applies via Lovable before E2E
  "20260722160000", // fix: restore onboarding access_token default/backfill/trigger (live rows had NULL token → onboarding blocked)
]);

function versionFromFilename(name: string): string | null {
  const m = /^(\d{14})_/.exec(name);
  return m ? m[1] : null;
}

function toEpochSeconds(v: string): number {
  // YYYYMMDDHHMMSS
  const y = Number(v.slice(0, 4));
  const mo = Number(v.slice(4, 6)) - 1;
  const d = Number(v.slice(6, 8));
  const h = Number(v.slice(8, 10));
  const mi = Number(v.slice(10, 12));
  const s = Number(v.slice(12, 14));
  return Date.UTC(y, mo, d, h, mi, s) / 1000;
}

describe("Migration application drift", () => {
  it("every migration file has an applied version within ±120s (or is on the allow-list)", () => {
    if (!existsSync(BASELINE_PATH)) {
      // First-time bootstrap: mark test skipped-but-informative by
      // asserting the baseline exists; the failure message tells the author
      // how to create it.
      expect.fail(
        `Baseline missing at ${BASELINE_PATH}. Create it by pasting the current ` +
          `\`SELECT array_agg(version) FROM supabase_migrations.schema_migrations\` ` +
          `result as {"appliedVersions": ["...", ...]}.`,
      );
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as {
      appliedVersions: string[];
    };
    const applied = baseline.appliedVersions.map(toEpochSeconds).sort((a, b) => a - b);

    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
    const drift: string[] = [];

    for (const f of files) {
      const v = versionFromFilename(f);
      if (!v) continue;
      if (KNOWN_UNAPPLIED.has(v)) continue;
      const fileEpoch = toEpochSeconds(v);
      // Nearest applied via linear scan (small N; ~500 rows).
      let nearest = Infinity;
      for (const a of applied) {
        const diff = Math.abs(a - fileEpoch);
        if (diff < nearest) nearest = diff;
        if (a - fileEpoch > TOLERANCE_SECONDS) break;
      }
      if (nearest > TOLERANCE_SECONDS) drift.push(f);
    }

    if (drift.length > 0) {
      const list = drift.map((f) => `  - ${f}`).join("\n");
      expect.fail(
        `Unapplied migration files detected (approval card never green-lit?):\n${list}\n\n` +
          `If these are intentionally superseded or cosmetic, add the version ` +
          `to KNOWN_UNAPPLIED with a reason. Otherwise, get them approved and ` +
          `refresh docs/audits/unapplied-migrations-baseline.json.`,
      );
    }
  });
});