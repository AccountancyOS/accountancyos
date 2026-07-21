#!/usr/bin/env bun
// Deterministic release checksums.
//
// Migration file:  bun scripts/release-checksum.ts supabase/migrations/<file>.sql
// Edge function:   bun scripts/release-checksum.ts supabase/functions/<name>
//
// Function checksum spans function dir + supabase/functions/_shared/** +
// the function's block in supabase/config.toml + deno.json / import map
// when present. VERSION.ts is EXCLUDED (it is regenerated from the checksum).

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function extractConfigBlock(functionName: string): string {
  const path = "supabase/config.toml";
  if (!existsSync(path)) return "";
  const src = readFileSync(path, "utf8");
  const header = `[functions.${functionName}]`;
  const idx = src.indexOf(header);
  if (idx === -1) return "";
  const rest = src.slice(idx);
  const next = rest.slice(header.length).search(/\n\[/);
  return next === -1 ? rest : rest.slice(0, header.length + next);
}

function checksumFile(path: string): string {
  return sha256(readFileSync(path));
}

function checksumFunction(dir: string): { checksum: string; entries: Array<{ path: string; sha256: string }> } {
  const functionName = dir.split(sep).filter(Boolean).pop()!;
  const files: string[] = [];
  files.push(...walk(dir));
  const sharedDir = join("supabase", "functions", "_shared");
  if (existsSync(sharedDir)) files.push(...walk(sharedDir));
  for (const extra of ["deno.json", join("supabase", "functions", "deno.json"), join(dir, "import_map.json")]) {
    if (existsSync(extra) && statSync(extra).isFile()) files.push(extra);
  }
  const filtered = files.filter((p) => !p.endsWith(`${sep}VERSION.ts`));
  const entries = filtered
    .map((p) => ({ path: relative(".", p).split(sep).join("/"), sha256: checksumFile(p) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const configBlock = extractConfigBlock(functionName);
  const manifest = JSON.stringify({ entries, config_block: configBlock });
  return { checksum: sha256(manifest), entries };
}

export function computeChecksum(target: string): { kind: "migration" | "edge_function"; checksum: string } {
  const st = statSync(target);
  if (st.isFile()) return { kind: "migration", checksum: checksumFile(target) };
  if (st.isDirectory()) return { kind: "edge_function", checksum: checksumFunction(target).checksum };
  throw new Error(`Not a file or directory: ${target}`);
}

if ((import.meta as any).main) {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: bun scripts/release-checksum.ts <path>");
    process.exit(2);
  }
  const r = computeChecksum(target);
  console.log(JSON.stringify(r, null, 2));
}