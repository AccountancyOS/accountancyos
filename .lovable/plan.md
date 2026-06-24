## Problem

`lifecycle_send_quote` (RPC called when you click Send on a quote) fails with `column "category" does not exist`. The template-lookup block references columns that don't exist on `public.templates`:

- `category` — never existed
- `is_active` — table uses `status` instead

The SELECT errors before the `INSERT INTO email_queue`, so the quote stays in `draft` and no email row is created.

## Fix

Single `CREATE OR REPLACE FUNCTION` migration replacing only the broken template-lookup block. No other logic changes.

Replace:

```sql
WHERE organization_id = v_quote.organization_id
  AND type = 'email'
  AND (category = 'quote' OR name ILIKE '%quote%' OR name ILIKE '%proposal%')
  AND COALESCE(is_active, true) = true
```

With (verified column types: `tags jsonb`, `status text`):

```sql
WHERE organization_id = v_quote.organization_id
  AND type = 'email'
  AND (
        COALESCE(tags, '[]'::jsonb) ? 'quote'
     OR name ILIKE '%quote%'
     OR name ILIKE '%proposal%'
      )
  AND COALESCE(status, 'active') = 'active'
```

`jsonb ? text` matches a top-level string element in a JSON array (the existing shape used in the templates UI). If no matching template exists the function already falls through to its hardcoded default body, so orgs without a custom quote template are unaffected.

## Verification

1. Re-send the failing quote at `/quotes/f2188a18-…`.
2. Confirm `quotes.status = 'sent'` and a new `email_queue` row appears with `context = 'quote'`.
3. `process-email-queue` cron drains it within ~5s.

## Scope

- One migration: `CREATE OR REPLACE FUNCTION public.lifecycle_send_quote`.
- No frontend changes, no schema changes, no other RPCs touched.
