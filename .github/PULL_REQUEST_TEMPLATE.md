## Summary
<!-- Explain what changed and why. Reference any workflows from docs/critical-workflows.md. -->

## Affected Workflows
<!-- List entries from docs/critical-workflows.md, or write "none". -->

## Change Checklist
See [`docs/change-checklist.md`](../docs/change-checklist.md). Each unchecked box needs a written justification.

- [ ] Impact analysis completed
- [ ] Vitest tests added / updated and `bun test` passes
- [ ] Migration is idempotent and RLS preserved (with GRANTs on new tables)
- [ ] Security review: no leaked secrets, no `USING (true)`, anon role minimal
- [ ] Edge functions registered in `infra/supabase-manifest.json` and deployed
- [ ] Email / auth-hook impact verified (when touched)
- [ ] `bun smoke` passes against the deployment (or waiver noted)
- [ ] Docs updated (`critical-workflows.md`, `supabase-manifest.json`, release notes)

## Test Evidence
<!-- Paste relevant Vitest output and/or smoke-test summary. -->