## Verified before proposing

- File present: `supabase/migrations/20260727160000_quote_token_returns_onboarding_token.sql`
- **sha256 = `85afd9fa413e5eec6a3e59691cd5dee290f812242434974507af3b62f9ac5c6f`** — matches the checksum recorded in `docs/releases/pending/2026-07-27-quote-token-returns-onboarding-token.json` exactly.
- Content check: single `CREATE OR REPLACE FUNCTION public.public_get_quote_by_token(p_token uuid)`; adds `RETURNING id, access_token INTO v_onboarding_id, v_access_token`, the NULL/empty self-heal via `gen_onboarding_access_token()`, and `'onboarding_access_token', v_access_token` in the returned payload. No `ALTER TABLE`, `CREATE TRIGGER` or `CREATE POLICY`.
- Live confirmation of the defect (this session): live `public_get_quote_by_token` def-hash `4e250dfdaccaa30a12e33f5b52cbd6cc`, returns `onboarding_application_id` with no token key. Live `public_accept_quote_by_token` (`4199627dad4b3e8d9c9e90f5872d0e72`) returns neither. Agreed on the data: 1 accepted quote, 1 onboarding application, `access_token` populated — **no data repair needed**.

## Apply plan

1. Record the pre-apply live def-hash `4e250dfdaccaa30a12e33f5b52cbd6cc` for `public_get_quote_by_token`.
2. Apply `20260727160000_quote_token_returns_onboarding_token.sql` verbatim via the migration tool (no edits, no additional statements).
3. Confirm the migration card is green **and** the new version row exists in `supabase_migrations.schema_migrations` on LIVE.

## Post-apply verification

- Fetch the live function definition; assert the def-hash changed from `4e250dfdaccaa30a12e33f5b52cbd6cc` and the body contains `'onboarding_access_token', v_access_token` plus `RETURNING id, access_token`.
- Behavioural: call `public_get_quote_by_token` with the live acceptance token for quote `753529f8-a903-4c84-b397-0a5ed0f3e82d` and confirm the payload returns a non-null `onboarding_access_token` matching `onboarding_applications.access_token` for application `eb73d94d-d6a7-4c74-9fd5-50c22b30786b`, alongside the unchanged `onboarding_application_id`.
- Negative: an unaccepted quote's payload must not carry a usable token.
- Run `bunx vitest run src/test/regression/quote-token-returns-onboarding-token.test.ts` (the migration must be the latest definer of the function).

## Record keeping

- Refresh `docs/audits/unapplied-migrations-baseline.json` with the newly applied version so the drift guard stays green.
- Complete `docs/releases/pending/2026-07-27-quote-token-returns-onboarding-token.json`: set `status`, `approver`, `applied_version`, `applied_at`, pre/post live def-hashes, and mark both expected objects `verified` with evidence; then move it out of `pending/` to `docs/releases/`.
- Carry forward the two `post_apply_followups` (accept RPC returning id+token directly; function-level def-hash drift gate) as separate increments — not touched here.

## Not in scope

No front-end changes — `PublicQuoteView` already reads both keys. No changes to `public_accept_quote_by_token`. No data writes.
