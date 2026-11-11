// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { UserConfig } from "vite";

/**
 * Cutover B / B2 — the frontend targets exactly one project, chosen by environment, and a build
 * without that environment FAILS rather than silently falling back to a baked-in project.
 * Executes vite.config.ts itself, not just its text.
 */
const root = resolve(__dirname, "../../../");
const VARS = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PROJECT_ID", "VITE_SUPABASE_PUBLISHABLE_KEY"] as const;

async function loadConfigFn() {
  const mod = await import("../../../vite.config");
  return mod.default as unknown as (env: { mode: string; command: "build" | "serve" }) => UserConfig;
}

// Vitest pre-loads .env files into process.env, so each case starts from a known-empty state and
// the original values are restored afterwards.
const saved = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
beforeEach(() => {
  for (const k of VARS) delete process.env[k];
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("vite.config.ts", () => {
  it("refuses to build when the Supabase variables are missing", async () => {
    const empty = mkdtempSync(join(tmpdir(), "aos-noenv-")); // no .env files here
    vi.spyOn(process, "cwd").mockReturnValue(empty);
    try {
      const config = await loadConfigFn();
      expect(() => config({ mode: "production", command: "build" })).toThrow(
        /Missing required environment variable\(s\): VITE_SUPABASE_URL, VITE_SUPABASE_PROJECT_ID, VITE_SUPABASE_PUBLISHABLE_KEY/,
      );
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("names exactly the variable that is missing", async () => {
    const empty = mkdtempSync(join(tmpdir(), "aos-partial-"));
    vi.spyOn(process, "cwd").mockReturnValue(empty);
    process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
    process.env.VITE_SUPABASE_PROJECT_ID = "example";
    try {
      const config = await loadConfigFn();
      expect(() => config({ mode: "production", command: "build" })).toThrow(
        /Missing required environment variable\(s\): VITE_SUPABASE_PUBLISHABLE_KEY\./,
      );
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("builds when all three are provided, and defines no project of its own", async () => {
    const empty = mkdtempSync(join(tmpdir(), "aos-env-"));
    vi.spyOn(process, "cwd").mockReturnValue(empty);
    process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
    process.env.VITE_SUPABASE_PROJECT_ID = "example";
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_example";
    try {
      const config = await loadConfigFn();
      const result = config({ mode: "production", command: "build" });
      expect(result.define).toBeUndefined(); // nothing baked in: Vite injects VITE_* from env
      expect(result.resolve?.alias).toBeDefined();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it(".env.example documents all three variables and carries no real key", () => {
    const example = readFileSync(resolve(root, ".env.example"), "utf8");
    for (const k of VARS) expect(example).toMatch(new RegExp(`^${k}=`, "m"));
    expect(example).not.toMatch(/sb_publishable_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/);
  });
});
