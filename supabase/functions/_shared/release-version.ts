// Shared release-identity helper for edge functions.
//
// Provides a side-effect-free version probe response and a cold-start
// identity log line. Values come from a per-function VERSION.ts stamped by
// scripts/stamp-release.ts. Never expose secrets, env values, config, or
// request data through this module.

export interface ReleaseIdentity {
  RELEASE_SHA: string;
  RELEASE_ID: string;
  ARTIFACT_CHECKSUM: string;
  RELEASE_BUILD_AT: string;
}

export interface VersionProbeResponse {
  name: string;
  release_sha: string;
  release_id: string;
  artifact_checksum: string;
  build_at: string;
  attestation: string;
}

const ATTESTATION =
  "deployment-attestation: values reflect the committed source the deployer " +
  "asserts was uploaded; not cryptographic proof of the running artifact.";

export function buildVersionResponse(
  name: string,
  id: ReleaseIdentity,
): VersionProbeResponse {
  return {
    name,
    release_sha: id.RELEASE_SHA,
    release_id: id.RELEASE_ID,
    artifact_checksum: id.ARTIFACT_CHECKSUM,
    build_at: id.RELEASE_BUILD_AT,
    attestation: ATTESTATION,
  };
}

// Handle a GET ?action=version probe. Returns a Response if this request is a
// probe, or null if the caller should continue normal dispatch. Must be called
// BEFORE any secret read, auth check, or provider API call.
export function handleVersionProbe(
  req: Request,
  name: string,
  id: ReleaseIdentity,
): Response | null {
  const url = new URL(req.url);
  if (url.searchParams.get("action") !== "version") return null;
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "version probe requires GET" }),
      {
        status: 405,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      },
    );
  }
  return new Response(JSON.stringify(buildVersionResponse(name, id)), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

export function logColdStartIdentity(name: string, id: ReleaseIdentity): void {
  // Fixed key=value shape so log scrapers can parse it. No secret names.
  console.log(
    `[release] fn=${name} release_sha=${id.RELEASE_SHA} ` +
      `release_id=${id.RELEASE_ID} artifact_checksum=${id.ARTIFACT_CHECKSUM} ` +
      `build_at=${id.RELEASE_BUILD_AT}`,
  );
}