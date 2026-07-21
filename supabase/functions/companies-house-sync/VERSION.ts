// Release stamp for companies-house-sync.
//
// The deployer OVERWRITES `source_sha` with the reviewed commit it is deploying
// from (the release's source_commit_sha), immediately before deploy — see
// docs/releases/production-release-convention.md §5. Committed on purpose so it
// ships inside the function tree: this is the reliable per-function carrier,
// since the current executor has no per-function deploy-time env vars.
//
// Why source_sha and not the deployed commit's own hash: a commit can never
// contain its own hash (stamping changes the hash), so the probe cannot
// self-report release_commit_sha. It reports source_sha (knowable); the shipped
// tree's identity as release_commit_sha is proven procedurally by the §4a
// pre-deploy checks (HEAD == release_commit_sha + clean tree), not by the probe.
//
// `source_sha` stays "unset" in git between releases; a deployed function
// reporting "unset" means it shipped without a release stamp. This is an
// ATTESTATION (what the deployed code claims to be), not cryptographic proof.
export const VERSION: { source_sha: string; built_at: string | null } = {
  source_sha: "unset",
  built_at: null,
};
