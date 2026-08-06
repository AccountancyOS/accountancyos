#!/usr/bin/env -S deno run --allow-env --allow-run
// DEF-031 fail-closed pre-check.
//
// `sandbox_exec` is a login role whose BYPASSRLS attribute has been observed to
// revert to `true` out of band (2026-08-05 repaired, 2026-08-06 recurred with the
// SAME oid, i.e. altered in place by platform automation rather than recreated).
//
// Owner ruling 2026-08-06: no sandbox_exec session may be treated as RLS evidence
// unless that SAME session first confirms rolbypassrls = false. Every executor and
// verifier run must therefore call this pre-check FIRST and abort on failure.
//
// It is fail-closed: any error, any missing row, any inability to read pg_roles
// aborts. Absence of a negative is never read as a pass.
//
// Usage:  deno run -A scripts/precheck-rls-boundary.ts
// Import: import { assertRlsBoundary } from "./precheck-rls-boundary.ts";

const SQL = `
SELECT r.rolname
     || '|' || r.oid
     || '|' || r.rolbypassrls
     || '|' || r.rolsuper
     || '|' || (SELECT count(*)
                  FROM pg_auth_members m
                  JOIN pg_roles p ON p.oid = m.roleid
                 WHERE m.member = r.oid AND (p.rolbypassrls OR p.rolsuper))
  FROM pg_roles r
 WHERE r.rolname = current_user`;

export type BoundaryState = {
  role: string;
  oid: number;
  bypassrls: boolean;
  superuser: boolean;
  bypassingParents: number;
};

export async function readBoundaryState(): Promise<BoundaryState> {
  const cmd = new Deno.Command("psql", {
    args: ["-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", SQL],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  if (code !== 0) {
    throw new Error(`RLS boundary pre-check could not read pg_roles (psql exit ${code}): ${new TextDecoder().decode(stderr).trim()}`);
  }
  const line = new TextDecoder().decode(stdout).trim();
  const parts = line.split("|");
  if (parts.length !== 5) {
    throw new Error(`RLS boundary pre-check returned an unreadable row: "${line}"`);
  }
  return {
    role: parts[0],
    oid: Number(parts[1]),
    bypassrls: parts[2] === "t" || parts[2] === "true",
    superuser: parts[3] === "t" || parts[3] === "true",
    bypassingParents: Number(parts[4]),
  };
}

/** Aborts (throws) unless THIS session is genuinely subject to row-level security. */
export async function assertRlsBoundary(): Promise<BoundaryState> {
  const s = await readBoundaryState(); // any failure propagates — fail closed
  const faults: string[] = [];
  if (s.bypassrls) faults.push("rolbypassrls = true");
  if (s.superuser) faults.push("rolsuper = true (bypasses RLS regardless)");
  if (s.bypassingParents > 0) faults.push(`inherits ${s.bypassingParents} SUPERUSER/BYPASSRLS role(s)`);
  if (faults.length > 0) {
    throw new Error(
      `DEF-031 PRE-CHECK FAILED — this session is NOT subject to RLS (${s.role}, oid ${s.oid}): ${faults.join("; ")}. ` +
      `Nothing observed in this session may be recorded as RLS evidence. Re-apply ALTER ROLE ${s.role} NOBYPASSRLS, ` +
      `open a NEW connection, and re-run. Do NOT add compensating grants.`,
    );
  }
  return s;
}

if (import.meta.main) {
  try {
    const s = await assertRlsBoundary();
    console.log(`DEF-031 pre-check PASS: ${s.role} oid=${s.oid} bypassrls=false superuser=false bypassing_parents=0`);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    Deno.exit(2);
  }
}
