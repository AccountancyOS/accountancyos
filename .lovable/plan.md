## Goal

Replace the email `context` taxonomy with the simplified list: **Quote, Onboarding, Engagement Letter, Job, Invoice, System, General** (plus "All" as the filter default).

## Changes

### 1. Database migration
- Backfill existing rows in `email_queue` and `email_messages`:
  - `chase` → `job`
  - `filing` → `job`
  - `ad-hoc` → `general`
  - `portal` → `general`
  - `engagement` stays `engagement`
  - `quote`, `onboarding`, `invoice`, `system` stay as-is
- Drop and recreate `email_queue_context_check` constraint with new allowed values: `quote, onboarding, engagement, job, invoice, system, general`.
- If `email_messages` has a matching check constraint, update it the same way.

### 2. Backend RPCs / senders
Update outbound email producers to emit the new contexts:
- `lifecycle_send_quote` → already `quote` ✅
- Engagement letter RPC → `engagement` ✅ (verify)
- Onboarding senders → `onboarding` (verify; no change expected)
- Invoice senders → `invoice` (no change expected)
- **Automation chaser runs** (`automation_chaser_runs` → email_queue) → `job`
- **Record request** emails → `job`
- **Filing notifications** (filing submitted/accepted/rejected) → `job`
- Anything currently writing `ad-hoc` or `portal` → `general`

I'll grep the codebase for `context:` and `'ad-hoc'|'chase'|'filing'|'portal'` literals and update each call site.

### 3. Frontend
- `src/lib/db-constants/check-constraints.ts` — update the context enum/array.
- `src/pages/Emails.tsx` — replace `contextLabels` and the filter dropdown options with: All, Quote, Onboarding, Engagement Letter, Job, Invoice, System, General.
- `src/components/email/EmailList.tsx` — update `CONTEXT_LABELS` badge mapping to the same 7 values.

### Display labels
| Value | Label |
|---|---|
| quote | Quote |
| onboarding | Onboarding |
| engagement | Engagement Letter |
| job | Job |
| invoice | Invoice |
| system | System |
| general | General |

## Out of scope
- No new email sending flows.
- No changes to queue processing, RLS, or scheduling.
- No new tables.
