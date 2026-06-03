I’ve audited the current failure and I agree this should have been caught before the previous fix was presented as complete.

## What Is Wrong

The approval RPC is out of sync with the current database schema.

1. **Immediate Error In Your Screenshot**
   - `lifecycle_approve_onboarding` tries to insert `engagement_id` into `public.jobs`.
   - The live `jobs` table no longer has an `engagement_id` column.
   - That is why approval fails with: `column "engagement_id" of relation "jobs" does not exist`.

2. **Additional Errors That Would Happen Next**
   The same job insert also uses invalid/currently incompatible values:
   - Inserts `name` instead of required `job_name`.
   - Uses job status `not_started`, but the live constraint expects values like `blank`, `records_requested`, `records_received`, etc.
   - Uses priority `medium`, but the live constraint expects `low`, `normal`, `high`, or `critical`.

3. **AML Trigger Is Still Wrong**
   - The earlier AML constraint was corrected to allow `verified`.
   - But the existing `auto_verify_aml_on_approval` trigger still sets AML to `passed`.
   - That means once the job insert is fixed, approval may then fail again on AML unless this trigger is fixed too.

## Fix Plan

1. **Replace The Approval RPC Safely**
   - Update `public.lifecycle_approve_onboarding` so it matches the live schema.
   - Remove `engagement_id` from `jobs` inserts.
   - Insert `job_name` and optionally mirror the same value into nullable `name` for compatibility.
   - Use valid job status `blank`.
   - Use valid priority `normal`.
   - Keep `engagement_id` only where it belongs, such as engagement records and deadline records.

2. **Make Approval Idempotent Where Practical**
   - Reuse an existing engagement for the quote/service/entity when one already exists.
   - Reuse an existing job for the same organization, entity, service type, and period label where possible.
   - This avoids duplicate jobs/engagements if quote acceptance already created records before client approval.

3. **Fix The AML Approval Trigger**
   - Replace `auto_verify_aml_on_approval` so it writes `verified`, not `passed`.
   - Keep `aml_verified_at` populated on approval.
   - Confirm the trigger and the table constraint use the same canonical AML statuses.

4. **Post-Fix Verification**
   - Re-check the live `jobs`, `deadlines`, `onboarding_applications`, and trigger schemas.
   - Run SQL assertions to verify the approval RPC no longer references missing columns or invalid enum/check values.
   - Check the browser/network signal for the approval action after the change.
   - Run targeted searches for other backend functions still inserting invalid job fields or AML statuses.

5. **Going Forward QA Standard**
   - For each fix, I will audit the full click path, not only the first error.
   - I will check database constraints, triggers, RPCs, frontend calls, and likely next-failure points before saying a flow is fixed.
   - I will only report completion after validating the relevant runtime signal, not merely after applying a migration.