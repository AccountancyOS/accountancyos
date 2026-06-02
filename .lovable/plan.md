## Two issues to fix

### A. Quote merge fields are invisible
The Merge Fields panel exposes 25 dot-notation tokens (`{{client.email}}` etc.) drawn from `template_merge_fields`. **No Quote category exists.** `lifecycle_send_quote` does resolve `{{quote_number}}`, `{{quote_total}}`, `{{currency}}`, `{{valid_until}}`, `{{accept_link}}`, `{{quote_lines_table}}`, `{{recipient_name}}`, `{{practice_name}}` — but those tokens cannot be discovered or inserted from the UI. My earlier "just paste it in the body" answer was wrong in practice.

### B. Every template ships blank
13 of 14 templates have empty `subject`, `body`, and `htmlBody`. Only `Quote Proposal` has real content. Accountants currently see an editor with nothing in it for: CRM follow-up, Deadline approaching, Engagement letter reminder, HMRC authorisation reminder, Invoice payment reminder, KYC document reminder, Message follow-up, New service welcome, Onboarding reminder, Questionnaire reminder, Records request reminder, Signature request reminder, Workpaper review reminder.

## Fix

### 1. Seed Quote merge fields (DB migration + insert)
Add a `quote` category to `template_merge_fields` whose keys match exactly what `lifecycle_send_quote` already substitutes — no RPC change required:

| Label              | Key                  |
|--------------------|----------------------|
| Quote Number       | `quote_number`       |
| Quote Total        | `quote_total`        |
| Currency           | `currency`           |
| Valid Until        | `valid_until`        |
| Accept Link        | `accept_link`        |
| Line Items Table   | `quote_lines_table`  |
| Recipient Name     | `recipient_name`     |
| Practice Name      | `practice_name`      |

Also add a `template_types text[]` column (default `'{all}'`) on `template_merge_fields`. Tag the new quote rows with `'{quote_proposal}'`. Update `EmailTemplateEditor.tsx` to filter the panel to fields whose `template_types` contains `'all'` or matches the template's category — so Quote tokens only show when authoring a Quote Proposal and don't clutter other templates.

Add a one-line hint under the Quote group: *"`{{quote_lines_table}}` renders the styled HTML table of line items when the template is dispatched by Send Quote."*

### 2. Seed real content into all 13 blank templates
Replace blank `content` JSON on every existing template (and re-seed on future installs) with a professional, ready-to-send body containing the appropriate merge tokens. Each template gets `subject`, plain-text `body`, `htmlBody` (matching the Quote Proposal styling — Arial, teal CTA where relevant, max-width 640px), and a `category`.

Drafts (tone: corporate, no emojis, Title Case, no placeholders left in subject lines):

| Template | Tokens used | Category |
|---|---|---|
| CRM follow-up reminder | `{{client.first_name}}`, `{{firm.name}}`, `{{user.first_name}}` | CRM |
| Deadline approaching | `{{client.first_name}}`, `{{deadline.filing_date}}`, `{{filing.type}}`, `{{firm.name}}` | Compliance |
| Engagement letter reminder | `{{client.first_name}}`, `{{firm.name}}`, `{{user.first_name}}` | Onboarding |
| HMRC authorisation reminder | `{{client.first_name}}`, `{{firm.name}}` | Onboarding |
| Invoice payment reminder | `{{client.first_name}}`, `{{invoice.amount}}`, `{{invoice.due_date}}`, `{{payment.reference}}`, `{{firm.name}}` | Billing |
| KYC document reminder | `{{client.first_name}}`, `{{firm.name}}` | Compliance |
| Message follow-up | `{{client.first_name}}`, `{{user.first_name}}`, `{{firm.name}}` | CRM |
| New service welcome | `{{client.first_name}}`, `{{service.name}}`, `{{firm.name}}` | Onboarding |
| Onboarding reminder | `{{client.first_name}}`, `{{firm.name}}` | Onboarding |
| Questionnaire reminder | `{{client.first_name}}`, `{{firm.name}}` (questionnaire link inserted via existing dialog) | Compliance |
| Records request reminder | `{{client.first_name}}`, `{{company.name}}`, `{{filing.period_end}}`, `{{firm.name}}` | Compliance |
| Signature request reminder | `{{client.first_name}}`, `{{firm.name}}` | Onboarding |
| Workpaper review reminder | `{{client.first_name}}`, `{{filing.type}}`, `{{filing.period_end}}`, `{{firm.name}}` | Compliance |

All bodies follow the same skeleton: greeting, 1–2 sentence context, clear action sentence, sign-off. Each `htmlBody` mirrors the `body` with matching inline styles (white background, Arial 15px, `#1a1a1a` text, teal `#0f766e` CTA where there is a link).

The existing `Quote Proposal` system template is already populated and stays as-is.

### 3. Make seeding self-healing for future orgs
Move the 13 templates from per-org rows into system templates (`organization_id IS NULL`) — same pattern as Quote Proposal. The org-scoped row pattern means every new firm currently inherits zero content. After this change:
- One row per template under `organization_id IS NULL` with rich content
- The Templates page already renders system templates in the "System Library" section (from the previous fix)
- "Clone & Customise" creates the org-scoped copy with content pre-filled

Delete the 13 existing blank org-scoped rows on the current test org during the same data migration (they have no usage — the Templates page will then show system-only).

## Files touched

- New schema migration: add `template_types` column to `template_merge_fields`; backfill `'{all}'`.
- Data insert (via insert tool): seed 8 quote merge fields; upsert 13 system templates with full content; delete the 13 blank org-scoped rows.
- `src/components/templates/EmailTemplateEditor.tsx`: filter merge fields by template type; render quote-token hint.
- No changes to `lifecycle_send_quote`, `process-email-queue`, or RLS.

## Verification

1. Open `/templates` → "System Library" section shows all 14 templates with non-empty previews.
2. Click "Clone & Customise" on any template → editor opens with the body pre-filled.
3. Open the Quote Proposal clone → Merge Fields panel includes a new "Quote" group with all 8 tokens.
4. Open a non-quote template → Quote group is hidden.
5. Re-send a draft quote → `email_queue.body_html` still contains the substituted line-items table (no regression).
