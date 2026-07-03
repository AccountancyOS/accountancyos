## Full redeploy plan

### 1. Frontend republish

Call `preview_ui--publish` once. This rebuilds from current main and redeploys to the Lovable-hosted origin that backs **both** `app.accountancyos.com` and `client.accountancyos.com` — they are custom-domain aliases of the same single-project deployment (memory: `single-project-portal-under-src-portal`). There is no separate portal build to publish.

After the tool returns I will report the published URL back. Note: the tool schedules the deploy and returns immediately; the new build hash is not exposed via tooling. To confirm the hash, hard-refresh either domain and check the `index-*.js` filename in DevTools — I'll flag this to you rather than fabricate a value.

### 2. Migration backlog

Enumerate `supabase/migrations/` from `20260703145810` onward and apply each via `supabase--migration` in filename order. Each call requires your approval. Any that the DB reports as already applied are skipped and noted.

Known files in that window (from prior turns):
- `20260703145810` — Stage 1 ledger posting *(applied earlier)*
- `20260703182847` — invoice settings *(applied earlier)*
- `20260703191841` — `invoice-pdfs` storage bucket *(applied earlier)*
- `20260703194607` — portal invoicing + IDOR fix *(applied earlier)*
- `20260703195953` — follow-up fix
- `20260703200043` — follow-up fix

Before starting I will `ls supabase/migrations/` to catch anything newer than what I know about, plus a `supabase--read_query` against `supabase_migrations.schema_migrations` to diff applied vs on-disk so nothing is missed. Final list of *newly applied* migrations will be reported back.

Also in scope: add the missing `email_queue.attachments jsonb` column. Edge-function logs show `process-email-queue` is currently crashing with `column email_queue.attachments does not exist`, which blocks **all** queued outbound email including invoice sends. Without this, redeploying `send-invoice` and `process-email-queue` is theatre. I will submit a small migration adding the column (nullable, default `'[]'::jsonb`) as part of the same batch unless you object.

### 3. Edge functions

Single `supabase--deploy_edge_functions` call with:
`generate-invoice-pdf`, `send-invoice`, `portal-verify-invoice-payment`, `process-email-queue`, `truelayer-callback`, `chaser-tick`, `send-engagement-letter`.

I'll verify each folder exists under `supabase/functions/` first; any missing name is reported back rather than silently dropped.

### 4. Reconciliation report

Final message will contain:
- Published URL + instructions to read the new `index-*.js` bundle hash from DevTools (tool doesn't expose it)
- List of migrations applied this run + list already-applied (skipped)
- List of edge functions successfully redeployed + any that errored
- Post-deploy `supabase--edge_function_logs` peek on `process-email-queue` and `send-invoice` to confirm they boot cleanly

### Order of operations

Migrations first (schema must be current before functions boot against it) → edge functions → frontend publish last (so the client bundle is querying the migrated schema). Each step gated on the prior succeeding.
