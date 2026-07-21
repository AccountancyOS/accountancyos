## Onboarding IDOR closure — diff for review

Investigation confirms your framing. Producing the two migrations + code diffs for review; nothing applied yet.

### Findings from the codebase

- **Every anon RPC caller in `PublicOnboarding.tsx` already threads `p_access_token: getAccessToken()`** — all 6 call sites (lines 71, 217, 238, 385, 460, 519). Safe to drop no-token overloads from the frontend's perspective.
- **One server-side gap**: `supabase/functions/onboarding-stripe-verify/index.ts:64` calls `public_complete_billing` **without** `p_access_token`. Stripe redirect returns to the applicant; verify runs with service role. Must be patched to look up the app's `access_token` and thread it, or the enforcement flip breaks the Stripe return path.
- **`PublicOnboarding.tsx` never reads back uploaded documents mid-flow** — only tracks via `public_record_aml_upload`. No applicant-side signed-URL RPC needed. One less moving part.
- **Reviewer + client-portal downloads use `storage.from().download()`** under the `Org members can view onboarding documents` policy (`auth.uid() IS NOT NULL AND user_has_organization_access(...)`). That policy stays. Direct authenticated downloads keep working; no forced signed-URL rewrite for the reviewer UI (though we can add it as a hardening follow-up).
- **Current anon storage policies** to remove/replace:
  - `Public can upload onboarding documents` (INSERT, anon) — replace with token-in-path INSERT
  - `Public can read own onboarding documents` (SELECT, anon) — **drop entirely**, no replacement

### Migration 1 — RPC enforcement flip (lands first, same push)

`supabase/migrations/<ts>_onboarding_rpc_token_required.sql`:

1. `DROP FUNCTION` the six no-token overloads:
   - `public_get_onboarding(uuid)`
   - `public_preview_engagement_letter(uuid)`
   - `public_sign_engagement_letter(uuid, jsonb)`
   - `public_record_aml_upload(uuid, text, text, text, integer, text)`
   - `public_skip_billing(uuid)`
   - `public_complete_billing(uuid, text, numeric)`
   - `public_submit_onboarding_for_review(uuid, text)`
2. In each remaining `(…, p_access_token text)` overload, change the validation block from
   ```sql
   IF p_access_token IS NOT NULL AND NOT public.validate_onboarding_access_token(...) THEN ...
   ```
   to
   ```sql
   IF p_access_token IS NULL OR NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
     RAISE EXCEPTION 'Invalid or missing onboarding access token' USING ERRCODE='42501';
   END IF;
   ```
   Bodies otherwise reproduced verbatim; diff will show only the validation block changed.
3. Re-`GRANT EXECUTE ... TO anon, authenticated`.

Effect: `public_get_onboarding` stops returning `file_path` to bare-UUID callers → path leak closed at the RPC layer even before storage is touched.

### Code change bundled with Migration 1

`supabase/functions/onboarding-stripe-verify/index.ts`: after loading `app`, thread its token:
```ts
const { error: rpcErr } = await supabase.rpc("public_complete_billing", {
  p_application_id: application_id,
  p_access_token: app.access_token,   // service-role read from onboarding_applications
  p_stripe_session_id: session_id,
  p_amount: amount,
});
```
Requires `app.access_token` in the earlier select. Redeploy `onboarding-stripe-verify` with this migration.

### Migration 2 — Storage lockdown (lands immediately after)

`supabase/migrations/<ts>_onboarding_storage_token_gate.sql`:

1. `DROP POLICY "Public can read own onboarding documents" ON storage.objects;` — no replacement. Anon SELECT is gone.
2. `DROP POLICY "Public can upload onboarding documents" ON storage.objects;`
3. New INSERT policy with token in path segment 4:
   ```sql
   CREATE POLICY "Public can upload onboarding documents with token"
     ON storage.objects FOR INSERT TO anon, authenticated
     WITH CHECK (
       bucket_id = 'onboarding-documents'
       AND public.is_active_onboarding_upload_path(name)
     );
   ```
4. New helper `is_active_onboarding_upload_path(text)`:
   - Parses `orgId/onboarding/appId/<token>/<filename>` (>= 5 segments).
   - Loads `onboarding_applications` by `(id, organization_id)`.
   - Requires `status NOT IN ('approved','rejected','cancelled')`.
   - Requires `v_parts[4] = access_token` AND `(access_token_expires_at IS NULL OR access_token_expires_at > now())`.
   - Only used in `WITH CHECK` (write path). Never used for SELECT — so the self-referential-read trap you flagged cannot arise.
5. Leave `is_active_onboarding_path` in place for now (no callers after policies drop), remove in a follow-up cleanup migration.

Authenticated reviewer/portal SELECT continues via the untouched `Org members can view onboarding documents` policy. Pre-token legacy objects (`orgId/onboarding/appId/file`) lose anon access for free; org staff still reach them.

### Code change bundled with Migration 2

`src/pages/PublicOnboarding.tsx` upload path (line 375):
```ts
const token = getAccessToken();
if (!token) { toast.error("Session expired — please reopen your onboarding link"); return; }
const path = `${bundle.organization.id}/onboarding/${bundle.application.id}/${token}/${docType}-${Date.now()}.${ext}`;
```
No other upload sites; reviewer UI writes go through the auth'd staff policy. `public_record_aml_upload` receives the same new path and stores it in `onboarding_documents.file_path` — reviewer downloads work unchanged because they read that stored path.

### What we're explicitly NOT doing (deferred, per your call)

- No object migration for pre-token uploads — they remain org-staff-reachable, anon-unreachable (window closes for free).
- No edge-function upload proxy (option b's cleaner endgame) — revisit if a further hardening pass is wanted.
- No forced signed-URL switch for the reviewer UI right now — the authenticated org policy is already tight; can be added later as defence-in-depth.

### Verification I'll run before saying "done"

1. `pg_proc` shows only the `(…, text)` overloads remain after Migration 1.
2. `pg_policies` on `storage.objects` shows no anon-reachable SELECT for bucket `onboarding-documents` after Migration 2.
3. Live test: fresh quote → accept → sign EL → upload AML doc (new token-in-path succeeds) → repeat upload attempt with `token` stripped from URL (fails at RPC before storage) → staff reviewer downloads the doc successfully.
4. Regression: `bunx vitest run src/test/regression/onboarding-token-threading.test.ts`.

### Publish order

Migration 1 → redeploy `onboarding-stripe-verify` → Migration 2 → publish frontend. Rollback per migration is independent (redeploy prior RPC bodies / re-create dropped policies).

Approve and I'll write the two migration files + the two code diffs for your review before applying anything.
