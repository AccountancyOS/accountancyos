import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

// Lightweight schema validator — the JSON Schemas exist as the canonical
// contract; this test asserts the example record has the required top-level
// shape and that any exception file marked closed carries a backfill SHA.

const RELEASES_DIR = resolve(__dirname, "../../../docs/releases");

function requiredKeys(): string[] {
  return [
    "release_id",
    "state",
    "owner",
    "approver",
    "source",
    "artifacts",
    "deployment_order",
    "expectations",
    "verification",
    "rollback",
  ];
}

describe("release records", () => {
  const files = readdirSync(RELEASES_DIR).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_"),
  );

  it("has at least one example record", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    it(`${f} has required top-level fields`, () => {
      const rec = JSON.parse(readFileSync(join(RELEASES_DIR, f), "utf8"));
      for (const k of requiredKeys()) {
        expect(rec, `missing ${k}`).toHaveProperty(k);
      }
      expect(rec.release_id).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+$/);
      expect(Array.isArray(rec.artifacts)).toBe(true);
      for (const a of rec.artifacts) {
        expect(a.artifact_checksum).toMatch(/^[0-9a-f]{64}$/);
      }
    });
  }
});

describe("release exceptions", () => {
  const dir = join(RELEASES_DIR, "exceptions");
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md",
  );

  for (const f of files) {
    it(`${f}: closed exception has backfill_commit_sha`, () => {
      const src = readFileSync(join(dir, f), "utf8");
      const statusMatch = src.match(/^status:\s*(\w+)/m);
      if (!statusMatch) return; // no frontmatter yet
      if (statusMatch[1] !== "closed") return;
      const sha = src.match(/^backfill_commit_sha:\s*([0-9a-f]{7,40})/m);
      expect(sha, `${f} is closed but has no backfill_commit_sha`).not.toBeNull();
    });
  }
});