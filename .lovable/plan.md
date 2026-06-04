# Fix Quote Acceptance → Engagement Letter Flow

## Problems

1. After clicking Accept, the page stalls on "Continuing to your onboarding…" — navigation never fires.
2. The engagement letter shows no services listed.
3. There is no actual letter body for the user to read before signing.

## Root Causes

- `public_accept_quote_by_token` returns only `{ success, client_id, company_id }` — no `onboarding_application_id`, so the frontend redirect target is `undefined`.
- The same RPC never writes `quotes.accepted_snapshot`, so the downstream `public_sign_engagement_letter` has no services to render.
- `public_get_onboarding` returns only `{ id, signed_at }` for the engagement letter — no document body exists pre-signature; the HTML is built inside the sign RPC.

## Changes

### 1. Database migration

- Patch `public_accept_quote_by_token` to:
  - Build `accepted_snapshot` JSONB from `quote_lines` (service_id, code, name, quantity, unit_price, subtotal, billing_frequency) plus `total_now`, `total_monthly`, `total_amount`, `currency`, `quote_number`, `accepted_at`, `valid_until`.
  - Persist it to `quotes.accepted_snapshot`.
  - Look up or create the matching `onboarding_applications` row.
  - Return `onboarding_application_id` in the result.
- Add `public_preview_engagement_letter(p_application_id uuid) returns text` — SECURITY DEFINER, builds the same HTML as the sign RPC but performs no writes.
- Patch `public_get_onboarding` to also return `engagement_letter.document_content` (preview HTML if unsigned, stored content if signed).

### 2. `src/pages/PublicQuoteView.tsx`

- Use `onboarding_application_id` from the accept response when present.
- If absent, re-call `public_get_quote_by_token` once to pick up the self-healed id.
- After ~1.5s with no id, render a "Continue Onboarding" button as a safety net instead of a perpetual spinner.

### 3. `src/pages/PublicOnboarding.tsx` (EngagementStep)

- On mount, call `public_preview_engagement_letter` (or use `bundle.engagement_letter.document_content` if already signed).
- Render the returned HTML through `sanitizeHtml` in a scrollable, bordered container above the signature input.
- Keep the existing bullet list beneath, relabelled as "Scope summary".

## Out of scope

- Per-practice letter templating, PDF export, e-signature versioning, Stripe Connect changes.
- Existing accepted quotes without snapshots are already self-healed by `public_get_quote_by_token`.
