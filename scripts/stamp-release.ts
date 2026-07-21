#!/usr/bin/env bunx tsx
/**
 * Rewrites `supabase/functions/<name>/VERSION.ts` from CLI args and exits
 * non-zero if any other file changed. See docs/releases/pilot-runbook.md §1.
 *
 * Usage:
 *   bunx tsx scripts/stamp-release.ts \
 *     --function companies-house-sync \
 *     --source-sha 9ec186a \
 *     --release-id 2026-07-21-ch-sync-probe-pilot
 *
 * `release_commit_sha` is intentionally left as the sentinel `"TBD-post-commit"`.
 * The commit that lands the stamped VERSION.ts *is* the release commit; the
 * receipt records its SHA after `git commit`.
 */
import { execSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function die(msg: string): never {
  console.error(msg);
  process.exit(2);
}

function main(): void {
  const fn = arg("function") ?? die("missing --function");
  const sourceSha = arg("source-sha") ?? die("missing --source-sha");
  const releaseId = arg("release-id") ?? die("missing --release-id");

  const dir = resolve(REPO_ROOT, "supabase/functions", fn);
  if (!existsSync(dir)) die(`no such function directory: ${dir}`);
  const versionPath = resolve(dir, "VERSION.ts");

  // Refuse to run on a dirty tree — the "only one file changed" invariant is
  // only meaningful from a clean baseline.
  const status = execSync("git status --porcelain", { cwd: REPO_ROOT, encoding: "utf8" });
  if (status.trim() !== "") {
    die(`refusing to stamp: workspace is dirty:\n${status}`);
  }

  const builtAt = new Date().toISOString();
  const body =
    `/**\n` +
    ` * Stamped by scripts/stamp-release.ts. DO NOT hand-edit.\n` +
    ` * release_id: ${releaseId}\n` +
    ` */\n` +
    `import type { ReleaseVersion } from "../_shared/release-version.ts";\n\n` +
    `export const VERSION: ReleaseVersion = {\n` +
    `  release_id: ${JSON.stringify(releaseId)},\n` +
    `  source_commit_sha: ${JSON.stringify(sourceSha)},\n` +
    `  release_commit_sha: "TBD-post-commit",\n` +
    `  built_at: ${JSON.stringify(builtAt)},\n` +
    `};\n`;
  writeFileSync(versionPath, body, "utf8");

  // Confirm the *only* diff is VERSION.ts.
  const diff = execSync("git status --porcelain", { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const nonVersion = diff.filter((l) => !l.endsWith(`supabase/functions/${fn}/VERSION.ts`));
  if (nonVersion.length > 0) {
    die(`refusing to complete stamp: unexpected diff:\n${nonVersion.join("\n")}`);
  }

  console.log(
    JSON.stringify(
      { stamped: `supabase/functions/${fn}/VERSION.ts`, release_id: releaseId, source_commit_sha: sourceSha, built_at: builtAt },
      null,
      2,
    ),
  );
  console.log(
    "\nNext: `git add` this file, commit with message `release: stamp " +
      fn +
      " " +
      releaseId +
      "`, then record the resulting commit SHA as `release_commit_sha` in the pending record.",
  );
}

main();