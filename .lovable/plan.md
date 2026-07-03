## Apply invoicing batch

All four migration files and all three edge function folders already exist in the repo. What's outstanding is running the migrations against the database and forcing a fresh deploy of the edge functions.

### Steps

1. **Run migrations** (via `supabase--migration`, each needs your approval before it executes):
   - `20260703145810` — Stage 1 posting
   - `20260703182847` — invoice settings
   - `20260703191841` — `invoice-pdfs` storage bucket
   - `20260703194607` — portal access + IDOR fix

   Each will be submitted as the exact SQL already in `supabase/migrations/<file>.sql`. If the DB reports "already applied", we skip and move on.

2. **Deploy edge functions** (via `supabase--deploy_edge_functions`, single call):
   - `generate-invoice-pdf`
   - `send-invoice`
   - `process-email-queue` (redeploy — current code is the attachment-forwarding version)

3. **Verify**: quick `supabase--read_query` on `invoice_settings`, `storage.buckets` (for `invoice-pdfs`), and a `supabase--edge_function_logs` peek on `send-invoice` to confirm it boots.

No code changes. No new files. No schema authored in this step — only replaying what's already in the repo.