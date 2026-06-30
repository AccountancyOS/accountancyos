# Enable Bookkeeping Module for portal-a

## Target
- Portal user: `portal-a@accountancyos.test`
- Linked client: **E2E Acceptor** (`5af184f0-6912-4d56-af1a-1ce324146fa0`)
- Existing `portal_visibility_settings` row found with `full_bookkeeping_access = false`.

## Change
Run a single data update:

```sql
UPDATE public.portal_visibility_settings
SET full_bookkeeping_access = true,
    updated_at = now()
WHERE client_id = '5af184f0-6912-4d56-af1a-1ce324146fa0';
```

This flips the master toggle described in `docs/portal-disabled-features.md`, which lets the portal user:
- Categorise transactions
- Match payments
- Create invoices/bills
- Connect a bank via TrueLayer
- Approve VAT returns

All writes will be stamped `created_by_portal=true`. Server-side enforcement (`portal_has_perm` + per-table RLS) is already in place — no schema changes required.

## Out of scope
- No code changes.
- No new permissions / no role changes.
- Not toggling any other portal user.

## Verification
After the update, log in as `portal-a` and confirm the Bookkeeping tab in the portal sidebar is no longer in read-only mode.
