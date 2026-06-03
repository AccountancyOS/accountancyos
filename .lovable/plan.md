Fix the AML and Approve-Client errors caused by a stale check constraint on `onboarding_applications.aml_status`.

## Root Cause
The DB constraint `onboarding_applications_aml_status_check` only permits `('pending', 'passed', 'failed', 'manual_review')`. Every code path (the `verify_aml` RPC, `lifecycle_approve_onboarding`, the React panel, badges, list view) uses the value `'verified'`. Any write that sets `aml_status = 'verified'` therefore violates the constraint, which is what the screenshot shows. This blocks both AML verification and approval (approval re-updates the row and re-checks the constraint).

## Fix (single migration)
1. Drop `onboarding_applications_aml_status_check`.
2. Recreate it as `CHECK (aml_status IN ('pending','verified','failed','manual_review'))` — the canonical set the app actually uses.
3. Backfill any legacy rows where `aml_status = 'passed'` to `'verified'` so historic data conforms (safe: `passed` was never written by current code).

No frontend or RPC changes needed — they already use `'verified'`.

## Verification
- Re-run AML verification on the affected onboarding application: badge flips to "Verified", no error.
- Click "Approve & Create Client": completes without the constraint error, client/company is created, portal access granted.