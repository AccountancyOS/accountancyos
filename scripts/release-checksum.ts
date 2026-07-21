#!/usr/bin/env bunx tsx
/**
 * Deterministic SHA-256 over an edge-function's release surface.
 *
 * Scope (per docs/releases/production-release-convention.md §6):
 *   - every file under the function directory
 *   - every `_shared/*.ts` file the function imports via `../_shared/<name>`
 *   - `supabase/functions/deno.json` and `supabase/functions/import_map.json`
 *     if present
 *   - the function's own `deno.json` / `import_map.json` if present
 *
 * The tree is walked in sorted order and each entry hashed as:
 *   `<repo-relative-posix-path>\0<sha256-hex-of-bytes>\n`
 * Then the concatenation is hashed once more. Result: stable across OS/FS.
 *
 * Usage:
 *   bunx tsx scripts/release-checksum.ts supabase/functions/companies-house-sync
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (st.isFile()) out.push(full);
  }
  return out;
}

function fileHash(abs: string): string {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}

function importedSharedFiles(functionDir: string): string[] {
  const sharedDir = resolve(REPO_ROOT, "supabase/functions/_shared");
  const referenced = new Set<string>();
  const rx = /from\s+["']\.\.\/_shared\/([^"']+)["']/g;
  for (const f of walk(functionDir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(f, "utf8");
    let m: RegExpExecArray | null;
    while ((m = rx.exec(src)) !== null) {
      const rel = m[1];
      const abs = resolve(sharedDir, rel);
      if (existsSync(abs) && statSync(abs).isFile()) referenced.add(abs);
    }
  }
  return [...referenced].sort();
}

export function computeFunctionChecksum(functionDirAbs: string): {
  checksum: string;
  files: Array<{ path: string; sha256: string }>;
} {
  const files: string[] = [];
  files.push(...walk(functionDirAbs));
  files.push(...importedSharedFiles(functionDirAbs));

  const candidates = [
    resolve(REPO_ROOT, "supabase/functions/deno.json"),
    resolve(REPO_ROOT, "supabase/functions/import_map.json"),
    resolve(functionDirAbs, "deno.json"),
    resolve(functionDirAbs, "import_map.json"),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) files.push(c);
  }

  const entries = [...new Set(files)]
    .map((abs) => ({ path: toPosix(relative(REPO_ROOT, abs)), abs }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const outer = createHash("sha256");
  const detail: Array<{ path: string; sha256: string }> = [];
  for (const e of entries) {
    const h = fileHash(e.abs);
    detail.push({ path: e.path, sha256: h });
    outer.update(`${e.path}\0${h}\n`);
  }
  return { checksum: outer.digest("hex"), files: detail };
}

function main(): void {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: bunx tsx scripts/release-checksum.ts <function-dir>");
    process.exit(2);
  }
  const abs = resolve(process.cwd(), arg);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    console.error(`not a directory: ${abs}`);
    process.exit(2);
  }
  const { checksum, files } = computeFunctionChecksum(abs);
  const payload = {
    function_dir: toPosix(relative(REPO_ROOT, abs)),
    checksum,
    files,
  };
  console.log(JSON.stringify(payload, null, 2));
}

// Only run when invoked as a script, not when imported by tests.
const isMain =
  typeof require !== "undefined" && require.main === module;
if (isMain) main();