#!/usr/bin/env bun
// Independent post-deploy verifier.
//
// Reads a release record, evaluates each expectation against live signals,
// and exits non-zero on any mismatch or inconclusive result.
//
// Live checks require production endpoints to be reachable. Use --offline to
// run only the schema + checksum checks; live checks are then reported as
// "inconclusive" (not "pass") and the exit code is non-zero.

import { readFileSync } from "node:fs";
import { computeChecksum } from "./release-checksum.ts";

type CheckResult = { check: string; result: "pass" | "fail" | "inconclusive"; detail?: string };

async function checkArtifactChecksums(rec: any): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const a of rec.artifacts ?? []) {
    try {
      const { checksum } = computeChecksum(a.path);
      if (checksum === a.artifact_checksum) {
        out.push({ check: `checksum ${a.id}`, result: "pass" });
      } else {
        out.push({
          check: `checksum ${a.id}`,
          result: "fail",
          detail: `declared=${a.artifact_checksum} actual=${checksum}`,
        });
      }
    } catch (e) {
      out.push({ check: `checksum ${a.id}`, result: "inconclusive", detail: String(e) });
    }
  }
  return out;
}

async function checkEndpointVersion(exp: any, targets: any, offline: boolean): Promise<CheckResult> {
  const label = `endpoint_version ${exp.artifact_id}`;
  if (offline) return { check: label, result: "inconclusive", detail: "skipped: offline" };
  const base = targets?.functions_base_url;
  if (!base) return { check: label, result: "inconclusive", detail: "no functions_base_url" };
  const url = `${base.replace(/\/$/, "")}/${exp.artifact_id}?action=version`;
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return { check: label, result: "fail", detail: `HTTP ${res.status}` };
    const body = await res.json();
    for (const k of Object.keys(exp.expected)) {
      if (body[k] !== exp.expected[k]) {
        return { check: label, result: "fail", detail: `${k}: expected=${exp.expected[k]} actual=${body[k]}` };
      }
    }
    return { check: label, result: "pass" };
  } catch (e) {
    return { check: label, result: "inconclusive", detail: String(e) };
  }
}

async function main() {
  const path = process.argv[2];
  const offline = process.argv.includes("--offline");
  if (!path) {
    console.error("usage: bun scripts/verify-release.ts <record.json> [--offline]");
    process.exit(2);
  }
  const rec = JSON.parse(readFileSync(path, "utf8"));
  const results: CheckResult[] = [];
  results.push(...(await checkArtifactChecksums(rec)));
  for (const exp of rec.expectations ?? []) {
    if (exp.kind === "endpoint_version") {
      results.push(await checkEndpointVersion(exp, rec.verification?.targets, offline));
    } else {
      results.push({
        check: `${exp.kind} ${exp.artifact_id}`,
        result: offline ? "inconclusive" : "inconclusive",
        detail: offline ? "skipped: offline" : "checker for this expectation kind not yet implemented; live DB adapter goes here",
      });
    }
  }
  const summary = { path, offline, results };
  console.log(JSON.stringify(summary, null, 2));
  const anyFail = results.some((r) => r.result !== "pass");
  process.exit(anyFail ? 1 : 0);
}

if (import.meta.main) main();