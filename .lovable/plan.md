## What you're actually editing today

The "Edit Variant" screen under Settings → Engagement Letter Variants edits the **cover email** — the message a client receives in their inbox, with the "View and Sign Engagement Letter" button. That's why you see HTML and a CTA button.

The **actual letter** that opens when the client clicks that button is a different thing entirely. Right now it is **hardcoded in SQL** inside the `public_sign_engagement_letter` and `public_preview_engagement_letter` database functions — fixed wording for Scope, Fees, Confidentiality, Acceptance, with the service lines and totals pulled from the accepted quote. There is no editor for it anywhere in the app.

## Fix

Let users author the letter document itself, per variant, using the same WYSIWYG editor as the email body. Existing variants keep their email body; we add a parallel letter body alongside it. The match/fallback rules (client type, service code, engagement kind, default) already work for the email — letter reuses them.

### Schema
- Add `letter_body text` to `engagement_letter_template_variants` (nullable). No data migration needed; null means "use the built-in default wording", so nothing breaks for existing variants.
- Grants/RLS unchanged — same table.

### Postgres functions
- `public_sign_engagement_letter` and `public_preview_engagement_letter`: after resolving the matching variant via `resolve_engagement_letter_variant`, if `letter_body` is non-empty, render it with the merge fields below and use it as `document_content`. Otherwise fall back to the existing hardcoded HTML.
- Merge fields supported in the letter body (rendered server-side):
  - `{{firm_name}}`, `{{client_name}}`
  - `{{services_list}}` — same `<ul><li>service — currency amount (frequency)</li></ul>` block built today
  - `{{accepted_date}}` — DD Mon YYYY of quote acceptance
  - `{{currency}}`, `{{total_one_off}}`, `{{total_monthly}}`
  - `{{today}}`

### UI changes (Settings → Engagement Letter Variants)
- Rename the screen header to **"Engagement Letter & Email Templates"** and the existing Body field to **"Cover Email Body"** so the distinction is obvious.
- Add a second WYSIWYG editor below: **"Engagement Letter Document"** using the same `LetterEditor` component. Empty = use the built-in default wording (shown as a hint).
- Add a button **"Insert Default Wording"** that prefills the letter editor with the current hardcoded default so users have a starting point instead of a blank page.
- Update the "Insert Field" dropdown on the letter editor to expose the letter-specific merge fields listed above (the email editor keeps its own field list).
- Update the "Preview With Sample Data" modal: show two tabs — *Cover Email* and *Letter Document* — each rendering the corresponding body with sample merge values substituted.

### Out of scope
- Per-section / clause-library style builder for the letter (single rich-text body, same as the email).
- Versioning, re-sign triggers, or change-management on existing letters already in flight — existing `engagement_letters.document_content` rows are immutable snapshots and stay as they were.
- Touching the actual signing UI (`/engagement/:token`) — it just renders whatever `document_content` we hand it.

### Files touched
- New migration: add `letter_body` column, rewrite the two `public_*_engagement_letter` functions with the merge-field renderer.
- `src/pages/settings/EngagementLetterVariants.tsx` — header rename, second editor, default-wording prefill, two-tab preview.
- `src/components/engagement-letter/LetterEditor.tsx` — minor: accept a `placeholder` prop for the empty-state hint.
- No edge-function changes (`send-engagement-letter` still sends the *email* body — the link in it now resolves to the new letter body).
