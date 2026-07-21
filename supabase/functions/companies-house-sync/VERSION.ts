// Release stamp for companies-house-sync.
//
// The deployer OVERWRITES these fields immediately before deploy (see
// docs/releases/production-release-convention.md §5): `source_commit_sha` = the
// reviewed commit being deployed, `release_id` = the pending record's id.
// Committed on purpose so it ships inside the function tree — the reliable
// per-function carrier, since the current executor has no per-function
// deploy-time env vars.
//
// The probe does NOT report the deployed commit's own hash: a commit can never
// contain its own hash, so release_commit_sha is proven procedurally by the §4a
// pre-deploy checks (HEAD == release_commit_sha + clean tree), not self-reported.
// The probe reports source_commit_sha (knowable) + release_id. This is an
// ATTESTATION of what the deployed code claims to be, not cryptographic proof.
//
// Values stay "unset" in git between releases; a deployed function reporting
// "unset" shipped without a release stamp.
export const VERSION: {
  source_commit_sha: string;
  release_id: string;
  built_at: string | null;
} = {
  source_commit_sha: "unset",
  release_id: "unset",
  built_at: null,
};
