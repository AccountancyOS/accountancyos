## Root cause

- The email's "from" name used `organizations.name` ("Leon's Practice"), but the real practice name lives in `organization_branding.trading_name` ("Blue Tick Accountants & Tax Advisers LLP"). The send RPC never reads that table.
- The email body was hard-coded inside `lifecycle_send_quote` — there is no template, no line items, no totals, no accept link.
- No system-seeded "Quote Proposal" template exists in `templates` for the accountant to customise.

## Fix

### 1. Seed a system Quote Proposal email template
New row in `templates` with `organization_id = NULL`, `type = 'email'`, `service = 'quote_proposal'`, `status = 'active'`. Content includes:
- `subject`: `"Your quote from {{practice_name}}"`
- `htmlBody`: branded HTML with greeting, intro paragraph, a `{{quote_lines_table}}` placeholder (server-rendered HTML table of line items, qty, unit price, line total, fee structure label), `{{quote_total}}`, `{{currency}}`, `{{valid_until}}`, a prominent `View & Accept Quote` button using `{{accept_link}}`, and a sign-off using `{{practice_name}}`.

Accountants can **clone-and-edit** this into an org-specific template (existing Templates UI already supports this) — the send RPC will prefer the org override when present.

### 2. Rewrite `lifecycle_send_quote` (replace existing function)
- Resolve `practice_name`: `organization_branding.trading_name` → `organization_branding.legal_name` → `organizations.name`.
- Resolve template: `templates` where `service = 'quote_proposal'` and `status = 'active'`, preferring `organization_id = v_quote.organization_id`, fallback to `organization_id IS NULL`.
- Build a server-side HTML `quote_lines_table` from `quote_lines` (description, qty, unit_price, line_total, fee_frequency badge, formatted in GBP), plus a `quote_total` figure.
- Mint an acceptance token (see §3) and compute `accept_link = https://app.accountancyos.com/q/{token}`.
- Insert into `email_queue` with `template_id` set, `merge_data` populated with `{recipient_name, practice_name, quote_number, currency, quote_total, valid_until, accept_link, quote_lines_table}` — the existing `process-email-queue` dispatcher already merges `{{…}}` placeholders against `merge_data` and renders the template's `htmlBody` / `subject`.

### 3. Public acceptance flow (carry-over from prior issue)
- New table `quote_acceptance_tokens (token uuid PK, quote_id, organization_id, expires_at, used_at, created_at)`. GRANT SELECT to `anon`, ALL to `service_role`. RLS allows anon SELECT only where `used_at IS NULL AND expires_at > now()`.
- `public_get_quote_by_token(p_token)` — returns quote header, lines, practice_name (for the public view).
- `public_accept_quote_by_token(p_token)` / `public_reject_quote_by_token(p_token, p_reason)` — SECURITY DEFINER, marks token used, performs accept/reject inline (no `user_has_organization_access` check).
- New page `src/pages/PublicQuoteView.tsx` and route `/q/:token` registered in `App.tsx` outside `DashboardLayout`. Renders the quote with branded styling + Accept / Reject buttons.

## Files

- `supabase/migrations/<ts>_quote_email_template_and_public_accept.sql`
  - Seed system template row
  - Create `quote_acceptance_tokens` + GRANTs + RLS
  - 3 new RPCs (`public_get_quote_by_token`, `public_accept_quote_by_token`, `public_reject_quote_by_token`)
  - `CREATE OR REPLACE FUNCTION lifecycle_send_quote(...)` rewritten per §2
- `src/pages/PublicQuoteView.tsx` (new)
- `src/App.tsx` — register `/q/:token` route

## Out of scope

- File attachment of a PDF quote (Lovable email infra doesn't support attachments; the in-email itemised table + portal accept link covers it).
- Per-accountant signature/footer (the seeded template uses practice_name only; accountants can edit the template to add their personal name).
