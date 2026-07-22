import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";

// Receipt-verified release gate (Database migration release contract).
//
// The release RECEIPT — not a timestamp allow-list — is the authoritative mapping
// between a migration file and the live database. This gate enforces that every
// migration authored under the receipt regime is covered by a receipt whose recorded
// content checksum matches the file on disk. A migration with no receipt, or a file
// whose bytes drifted from its receipted checksum, fails CI.
//
// Cutover: migrations with a version >= RECEIPT_REGIME_START are governed here.
// Everything before is legacy, grandfathered by the applied-versions baseline
// (see migration-application-drift.test.ts). This boundary is intentional: we cannot
// retroactively write receipts for hundreds of historical migrations, but every new
// release must have one.
const RECEIPT_REGIME_START = "20260722130000";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");
const RELEASES_DIR = join(process.cwd(), "docs/releases");
const BASELINE_PATH = join(process.cwd(), "docs/audits/unapplied-migrations-baseline.json");

function toEpochSeconds(v: string): number {
  return (
    Date.UTC(
      Number(v.slice(0, 4)),
      Number(v.slice(4, 6)) - 1,
      Number(v.slice(6, 8)),
      Number(v.slice(8, 10)),
      Number(v.slice(10, 12)),
      Number(v.slice(12, 14)),
    ) / 1000
  );
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function versionOf(filename: string): string | null {
  const m = /^(\d{14})_/.exec(filename);
  return m ? m[1] : null;
}

// Every JSON receipt under docs/releases (pending/ and completed at the top level).
function loadReceipts(): { file: string; json: any }[] {
  const out: { file: string; json: any }[] = [];
  const dirs = [RELEASES_DIR, join(RELEASES_DIR, "pending")];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const full = join(dir, f);
      out.push({ file: full, json: JSON.parse(readFileSync(full, "utf8")) });
    }
  }
  return out;
}

// A receipt maps migrations under either `migrations[]` (this repo's schema) or
// `migration_files[]` (the executor-authored schema). Both carry {path, sha256}.
function migrationEntries(json: any): { path: string; sha256: string }[] {
  const raw = json.migrations ?? json.migration_files ?? [];
  return raw
    .filter((e: any) => e && typeof e.path === "string")
    .map((e: any) => ({ path: e.path, sha256: e.sha256 }));
}

describe("migration release receipt gate", () => {
  const receipts = loadReceipts();

  it("every receipt is valid JSON with a release_id", () => {
    for (const { file, json } of receipts) {
      expect(json, `${file} missing release_id`).toHaveProperty("release_id");
      expect(typeof json.release_id, `${file} release_id must be a string`).toBe("string");
    }
  });

  it("every receipted migration path exists and its checksum matches the file on disk", () => {
    const problems: string[] = [];
    for (const { file, json } of receipts) {
      for (const entry of migrationEntries(json)) {
        const abs = join(process.cwd(), entry.path);
        if (!existsSync(abs)) {
          problems.push(`${file}: references missing migration ${entry.path}`);
          continue;
        }
        if (!entry.sha256) {
          problems.push(`${file}: migration ${entry.path} has no sha256 in the receipt`);
          continue;
        }
        const actual = sha256(abs);
        if (actual !== entry.sha256) {
          problems.push(
            `${file}: ${entry.path} checksum drift — receipt ${entry.sha256.slice(0, 12)}… vs file ${actual.slice(0, 12)}… (a migration must never be edited after its receipt)`,
          );
        }
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("every PENDING post-regime migration is covered by a receipt", () => {
    // Contract: a *pending* migration (not yet applied) must have a receipt before it
    // can be released. An *applied* migration is governed by the applied-versions
    // baseline (schema_migrations is evidence a batch ran). The executor re-timestamps
    // on apply, so a migration is "applied" if the baseline holds a version within
    // ±120s of it — which is exactly how the executor's re-authored duplicate of an
    // authored file gets governed without needing its own receipt.
    const baseline = existsSync(BASELINE_PATH)
      ? (JSON.parse(readFileSync(BASELINE_PATH, "utf8")).appliedVersions as string[])
      : [];
    const appliedEpochs = baseline.map(toEpochSeconds);
    const isApplied = (v: string) => {
      const e = toEpochSeconds(v);
      return appliedEpochs.some((a) => Math.abs(a - e) <= 120);
    };

    const governed = new Set<string>();
    for (const { json } of receipts) {
      for (const entry of migrationEntries(json)) {
        governed.add(entry.path.replace(/^.*supabase\/migrations\//, ""));
      }
    }

    const ungoverned: string[] = [];
    for (const f of readdirSync(MIGRATIONS_DIR)) {
      if (!f.endsWith(".sql")) continue;
      const v = versionOf(f);
      if (!v || v < RECEIPT_REGIME_START) continue; // legacy → baseline governs it
      if (isApplied(v)) continue; // applied → batch-ran evidence governs it
      if (!governed.has(f)) ungoverned.push(f); // pending + no receipt → violation
    }

    expect(
      ungoverned,
      `Pending migrations at/after the receipt regime (${RECEIPT_REGIME_START}) with NO release receipt:\n` +
        ungoverned.map((f) => `  - ${f}`).join("\n") +
        `\n\nAdd each to a receipt under docs/releases/ (path + sha256 + expected_objects). ` +
        `The receipt — not KNOWN_UNAPPLIED — is how a pending migration is governed.`,
    ).toEqual([]);
  });

  it("a completed release (moved out of pending/) has no unverified expected objects", () => {
    // Once a receipt sits at docs/releases/ top level (or is marked completed), every
    // expected object must carry a non-pending verification result — a schema_migrations
    // row alone is insufficient per the contract.
    const problems: string[] = [];
    for (const { file, json } of receipts) {
      const isPending = file.includes(`${RELEASES_DIR}/pending/`) || json.status?.includes("pending");
      if (isPending) continue;
      const objs = (json.migrations ?? []).flatMap((m: any) => m.expected_objects ?? []);
      for (const o of objs) {
        if (o.result === "pending" || o.result == null) {
          problems.push(`${file}: expected object "${o.id ?? o.object}" still pending in a completed receipt`);
        }
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
