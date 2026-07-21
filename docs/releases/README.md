# Production Releases

Git is the source of truth for **intended** production state. Lovable Cloud is
the authorised **executor** for now. Every production change must be traceable
from a reviewed Git revision to independently verifiable live state.

Start here: [`production-release-convention.md`](./production-release-convention.md).

## Layout

- `production-release-convention.md` — the canonical convention. Single source.
- `_schema/pending-release.schema.json` — JSON Schema for a pending release.
- `_schema/release-record.schema.json` — JSON Schema for the appended post-deploy record.
- `EXAMPLE-*.json` — worked examples.
- `exceptions/` — incident-class out-of-band changes and their mandatory backfill PRs.
- `pilot-runbook.md` — the first controlled release (`companies-house-sync`).

## Filing a release

1. Open a PR that includes the change **and** a `docs/releases/<id>.json`
   pending declaration validating against `pending-release.schema.json`.
2. On merge, run `bun scripts/release-checksum.ts <path>` and record the
   checksum in the pending record.
3. For an edge function, run `bun scripts/stamp-release.ts --function <name>
   --sha <merged-sha> --release-id <id>` to write `VERSION.ts`, then commit.
4. Ask Lovable to apply in the declared order.
5. Run `bun scripts/verify-release.ts docs/releases/<id>.json` against the
   production custom domain. A non-zero exit blocks the release from being
   recorded as `succeeded`.
6. Append the post-deploy record fields and add the id to
   `infra/release-manifest.json`.