## Problem

Sending a quote fails with:
`null value in column "organization_id" of relation "quote_acceptance_tokens" violates not-null constraint`

## Why it's back

I confirmed against the live database — the current `public.lifecycle_send_quote` function body has:

```sql
INSERT INTO quote_acceptance_tokens(token, quote_id, expires_at)
VALUES (v_token, p_quote_id, now() + interval '30 days');
```

Migration `20260604205211_…` rewrote this RPC and dropped `organization_id` from the INSERT. The column is `NOT NULL`, so every send attempt fails. No later migration has restored it, so the previous fix is no longer in effect.

## Fix

One new migration that re-creates `public.lifecycle_send_quote` identical to the current definition, with a single line changed:

```sql
INSERT INTO quote_acceptance_tokens(token, quote_id, organization_id, expires_at)
VALUES (v_token, p_quote_id, v_quote.organization_id, now() + interval '30 days');
```

`v_quote.organization_id` is already loaded at the top of the function (and used for the access check), so no extra lookup is needed.

## Guardrail to prevent regression

Add a small safety net in the same migration: a `BEFORE INSERT` trigger on `quote_acceptance_tokens` that backfills `organization_id` from the parent `quotes` row when the caller forgets to pass it. This way, if another future rewrite drops the column again, sending won't break.

## Out of scope

- No table/schema changes to `quote_acceptance_tokens` itself.
- No frontend changes.
- No changes to other lifecycle RPCs (resend, accept, reject) — they don't insert tokens.

## Verification

After approval:
1. Re-fetch the function definition and confirm `organization_id` is in the INSERT.
2. Send the quote at `/quotes/f19ebf37-…` and confirm a token row is created with the correct `organization_id`.
