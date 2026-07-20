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