## Goal
Redeploy the `companies-house-sync` edge function from the git source to clear the current 400 error and restore live Companies House search.

## Steps
1. Call `supabase--deploy_edge_functions` with `["companies-house-sync"]` to push the current `supabase/functions/companies-house-sync/index.ts` (live Basic-auth Public Data API, no mocks).
2. Smoke test with `supabase--curl_edge_functions` — POST a small `search` action (e.g. `{ "action": "search", "query": "blue tick" }`) and confirm a 200 with real CH results, not `Companies House search failed (400)`.
3. If it still 400s, pull `supabase--edge_function_logs` for `companies-house-sync`, inspect the CH response body the function relays, and report the exact upstream reason (most likely `CH_PROD_API_KEY` missing/wrong scope) — no code changes without your say-so.

## Notes
- Backend-only change, deploys immediately, no frontend publish required.
- No migrations, no secret changes in this step.
