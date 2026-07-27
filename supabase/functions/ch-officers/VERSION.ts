// Release stamp for ch-officers.
//
// Same contract as companies-house-sync/VERSION.ts (see
// docs/releases/production-release-convention.md §5): the deployer OVERWRITES
// `source_commit_sha` and `release_id` immediately before deploy, and the
// function reports them via `?action=version` plus a cold-start log.
//
// This function exists precisely BECAUSE a deploy of companies-house-sync
// silently did not take effect, so being able to ask a running function which
// commit it came from is part of the point of it.
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
