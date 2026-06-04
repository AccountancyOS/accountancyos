# Use Recipient's Personal Name in All Outbound Emails

## Problem

Some emails address the recipient by company name (e.g. "Dear Churchills London") instead of the human contact's name. The engagement letter, quote-acceptance preview, and quote-send email all fall back to `company_name` when a company is attached.

## Rule

Always address the recipient by their personal name. Resolution order, used everywhere:

1. `clients.preferred_name` (when a client is linked and the column is set)
2. `first_name` (+ `last_name` for full-name slots) from the lead, client, or onboarding application
3. `company_name` only as a last resort when no personal name exists

`preferred_name` already exists on `clients`. No new columns needed; leads and onboarding applications keep first/last name only.

## Changes

### Database functions (single migration)

- `public.lifecycle_send_quote` — when resolving the recipient name and first name, take `clients.preferred_name` over `first_name` if present; for company-only quotes, fall back to the linked director/contact's first name before using `company_name`.
- `public.public_get_quote_by_token` — `recipient_name` follows the same order: preferred_name → first+last → company_name.
- `public.public_sign_engagement_letter` and `public.public_preview_engagement_letter` — replace `v_client_name := COALESCE(v_app.company_name, first+last)` with the new order: look up `clients.preferred_name` via `onboarding_applications.client_id` when present, then first+last from the application, then `company_name`.

### Edge function

- `supabase/functions/send-engagement-letter/index.ts` — `recipientName` currently picks `first+last` only for individual applications, otherwise `company_name`. Change to: preferred_name (if `client_id` set) → `first+last` (if either is set) → `company_name`. Apply for both the email body and the `{{recipient_name}}` placeholder substitution.

## Out of scope

- Adding `preferred_name` to leads or onboarding_applications.
- Changing chaser templates — those already use `{{client.first_name}}` placeholders, which are unaffected.
- Tone/copy of the templates themselves.
