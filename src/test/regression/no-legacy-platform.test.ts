import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";

/**
 * Cutover B (2026-11-11): the legacy Lovable-hosted project is retired. AccountancyOS has one
 * backend (London, ezsvdsjdtardkxfswjvq) and no dependency on the Lovable platform.
 *
 * The retired identifiers are spelled out only in src/test/retired-identifiers.ts, which this test
 * imports to keep them out of everything else. Excluded from the scan, deliberately:
 *   - docs/ — historical record, kept as written;
 *   - supabase/migrations_archive/ — pre-baseline history, never applied;
 *   - this file.
 * Allowed exception, and why:
 *   - supabase/functions/auth-email-hook — the deployed Supabase Auth send-email hook still uses
 *     Lovable's email + webhook libraries. Replacing that sender is the email workstream, outside
 *     cutover B. The exception is pinned to that one directory so it cannot spread.
 */
const root = resolve(__dirname, "../../../");
import { LEGACY_REF, RETIRED_IDENTIFIERS as RETIRED } from "../retired-identifiers";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "docs", "migrations_archive", ".temp"]);
const SELF = relative(root, __filename);
const IDENTIFIERS_MODULE = "src/test/retired-identifiers.ts";
const ALLOWED_PREFIX = "supabase/functions/auth-email-hook/";
const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|toml|sql|html|md|yml|yaml|css|sh)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) return walk(p);
    return TEXT.test(name) || name.startsWith(".env") ? [p] : [];
  });
}

const files = walk(root)
  .map((p) => relative(root, p))
  .filter((p) => p !== SELF && p !== IDENTIFIERS_MODULE && p !== "package-lock.json" && !p.startsWith(".env"));

describe("the legacy project and platform are retired from active code", () => {
  it("no active file references the legacy project ref or Lovable hosts/packages", () => {
    const offenders = files
      .filter((p) => !p.startsWith(ALLOWED_PREFIX))
      .flatMap((p) => {
        const src = readFileSync(resolve(root, p), "utf8");
        return RETIRED.filter((needle) => src.includes(needle)).map((needle) => `${p}: ${needle}`);
      });
    expect(offenders).toEqual([]);
  });

  it("the one allowed exception references no legacy project or Lovable host", () => {
    const src = readFileSync(resolve(root, ALLOWED_PREFIX, "index.ts"), "utf8");
    expect(src).not.toContain(LEGACY_REF);
    expect(src).not.toMatch(/lovable\.app|lovableproject\.com/);
  });

  it("package.json declares no Lovable dependency and the lockfile resolves none", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    expect(Object.keys(deps).filter((d) => d.startsWith("@lovable.dev/") || d === "lovable-tagger")).toEqual([]);
    const lock = readFileSync(resolve(root, "package-lock.json"), "utf8");
    expect(lock).not.toMatch(/node_modules\/(@lovable\.dev\/|lovable-tagger)/);
  });

  it("supabase/config.toml and the frontend target London only", () => {
    expect(readFileSync(resolve(root, "supabase/config.toml"), "utf8")).toMatch(/^project_id = "ezsvdsjdtardkxfswjvq"$/m);
    const vite = readFileSync(resolve(root, "vite.config.ts"), "utf8");
    expect(vite).not.toMatch(/\.supabase\.co/); // no baked-in project URL
    expect(vite).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/); // no baked-in key
    expect(vite).toMatch(/Missing required environment variable/);
  });

  it("there is exactly one lockfile, and it is npm's", () => {
    expect(existsSync(resolve(root, "package-lock.json"))).toBe(true);
    for (const f of ["bun.lock", "bun.lockb", "yarn.lock", "pnpm-lock.yaml"]) {
      expect(existsSync(resolve(root, f)), f).toBe(false);
    }
  });
});
