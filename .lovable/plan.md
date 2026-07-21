Going with the **fast track** — redeploy `companies-house-sync` from current main (HEAD = `2ebd837`, which is the fix commit that drops the non-existent `companies.client_id` column from the SELECT). No pilot stamping this round; keeps this narrowly a hotfix.

## Steps

1. `supabase--deploy_edge_functions` with `["companies-house-sync"]` — deploys the current workspace tree, which is clean at `2ebd837`.
2. Tail `supabase--edge_function_logs` for `companies-house-sync` to confirm the new instance boots without the old cold-start error.
3. Ask you to re-trigger the Bassage Eyes sync from the UI and confirm the success toast + officers/PSCs appear. (I can also drive it via Playwright against the preview if you'd rather I self-verify.)

## Not doing (deferred)

- No `VERSION.ts` stamp, no `verify-release.ts` run, no receipt. That stays queued as the *actual* first pilot — this deploy is a hotfix, not a convention exercise. Logged as an exception per the convention (§ exception register) once done.
- No frontend publish — the fix is edge-function only.

## Rollback

If the deploy makes things worse, redeploy the previous commit (`git checkout <prev>` on `supabase/functions/companies-house-sync/index.ts` and redeploy). No schema touched.

Say go and I'll run steps 1–2.
