/**
 * Release identity helper (see docs/releases/production-release-convention.md §5).
 *
 * Each function ships a committed `VERSION.ts` stamped at release-declaration time.
 * The `?action=version` probe returns this shape — no secrets, no request echo:
 *
 *   { function, sha, source_sha, release_id, built_at }
 *
 * This is a **deployment attestation** (what the running function claims to be),
 * not cryptographic proof of provenance. Independent verification lives in
 * scripts/verify-release.ts.
 */

export interface ReleaseVersion {
  /** Human release id, e.g. "2026-07-21-ch-sync-probe-pilot". */
  release_id: string;
  /** Reviewed, merged commit the release was authorised from. */
  source_commit_sha: string;
  /** Post-stamp commit whose tree was actually deployed. */
  release_commit_sha: string;
  /** ISO-8601 timestamp recorded at stamp time. */
  built_at: string;
}

export interface VersionProbeResponse {
  function: string;
  sha: string;
  source_sha: string;
  release_id: string;
  built_at: string;
}

export function buildVersionResponse(
  functionName: string,
  v: ReleaseVersion,
): VersionProbeResponse {
  return {
    function: functionName,
    sha: v.release_commit_sha,
    source_sha: v.source_commit_sha,
    release_id: v.release_id,
    built_at: v.built_at,
  };
}

/** Cold-start log helper. Safe-by-construction — only release metadata. */
export function logColdStartIdentity(functionName: string, v: ReleaseVersion): void {
  console.log(
    `[boot] ${functionName} release_id=${v.release_id} source_sha=${v.source_commit_sha} release_sha=${v.release_commit_sha} built_at=${v.built_at}`,
  );
}