
# Quote Acceptance, Decline & Re-Issue

## Goals

1. Accepting a public proposal automatically creates the right client / company records, links them, and provisions engagements, jobs and deadlines for every service on the quote.
2. Declining moves the lead to `lost` and locks the quote as `rejected`.
3. Accountants can re-issue a quote (edit lines, totals, validity, notes) which supersedes the previous one and invalidates its acceptance link.

---

## 1. Service → Entity Routing

Each `services_catalog.code` is classified so the acceptance RPC knows which kind of client record it belongs to. Stored as a new `entity_scope` column on `services_catalog` (values: `individual`, `company`, `partnership`, `either`):

| Code | Scope |
|------|-------|
| `sa_non_mtd`, `sa_mtd`, `cgt_60_day` | individual |
| `company_accounts`, `corporation_tax`, `confirmation_statement`, `registered_office` | company |
| `vat_return`, `payroll`, `cis`, `p11d`, `pensions`, `mtd_quarterly`, `advisory` | either (attached to whichever entity exists; defaults to company if both) |
| (future) `partnership_return` | partnership |

Backfill the column for the 14 seeded service codes; default new rows to `either`.

## 2. Acceptance Flow (rewrite `public_accept_quote_by_token`)

When the token is valid and the quote is `draft` / `sent`:

1. Lock quote and mark `accepted`, `accepted_at = now()`, token `used`.
2. Build the set of required entities from `quote_lines` joined to `services_catalog.entity_scope`:
   - Any `individual` line → ensure an **individual client** exists.
   - Any `company` line → ensure a **company** exists.
   - Any `partnership` line → ensure a **partnership client** (`clients.client_type = 'partnership'`).
   - `either` lines attach to the company if one is being created, otherwise the individual.
3. Resolve / create entities from the lead:
   - Match existing records by `(organization_id, lower(email))` before inserting.
   - Individual: insert into `clients` (first/last name, email, phone, `client_type = 'sa_non_mtd'` or `'sa_mtd'` based on line mix, `status = 'pending'`).
   - Company: insert into `companies` using `leads.ch_company_profile` (name, number, registered office) plus contact details.
   - Partnership: insert into `clients` with `client_type = 'partnership'`.
4. **Link records for a single portal login** by inserting rows into `accountant_client_links` between the individual and the company/partnership (`relationship = 'self'`, both linked to the same `portal_user_id` once invited). Mark them as siblings so the portal shows both workspaces under one login.
5. For each `quote_lines` row, insert an `engagements` row (`status = 'active'`, `quote_id`, `service_id`, `client_id` or `company_id`, `billing_frequency`, `unit_price`, `quantity`). Existing engagement-trigger logic will:
   - Generate the first **job** from `services_catalog.default_job_template_id`.
   - Generate **deadlines** via the standard deadline auto-calc (year-end driven for companies, tax year for individuals, CGT 60-day rule, etc.).
6. Update the lead: `pipeline_stage = 'won'`, `converted_at = now()`, `converted_to_client_id` and/or `converted_to_company_id` populated.
7. Fire `automation_events` (`CLIENT_ONBOARDING_STARTED` per entity, `QUOTE_ACCEPTED`) so existing chasers / welcome emails kick in, and notify the assigned accountant.
8. Write `audit_log` entries for every insert.

Idempotency: keyed off `quotes.ported_to_client_id` / `ported_to_company_id` (add `ported_to_company_id` column) so replays no-op.

## 3. Decline Flow (rewrite `public_reject_quote_by_token`)

1. Mark quote `rejected`, capture optional reason (UI now passes a textarea value).
2. If the quote has a `lead_id` and the lead is not already `won`, call `mark_lead_lost(lead_id, 'Quote declined')`.
3. Mark token used.
4. Emit `QUOTE_REJECTED` automation event so the accountant is notified.
5. Audit entry as today.

UI change in `PublicQuoteView.tsx`: replace `confirm()` with a small dialog that captures an optional reason and passes it to the RPC.

## 4. Re-Issue Feature

New RPC `reissue_quote(p_quote_id uuid) returns uuid` (SECURITY DEFINER, org-scoped):

- Clones the source quote and its `quote_lines` into a new `quotes` row with `status = 'draft'`, fresh `quote_number`, copies `lead_id` / `client_id` / `company_id` / `notes` / `valid_until`.
- Sets `quotes.supersedes_quote_id = p_quote_id` (new column).
- On the original: if `status IN ('sent','draft')` set to `superseded`; invalidate any open `quote_acceptance_tokens` (`used_at = now()`, `reason = 'superseded'`).
- Add `'superseded'` to the `quotes_status_check` constraint.

Accountant UI on `QuoteDetail.tsx`:
- "Re-Issue" button (visible for `sent`, `rejected`, `expired`, `superseded` quotes that have not been accepted).
- Calls `reissue_quote`, navigates to the new draft where the existing `CreateQuoteDialog` editing flow handles line / price / validity edits.
- Send flow is unchanged (`lifecycle_send_quote` mints a new token and sends the templated email).

Already-accepted quotes cannot be re-issued (would require an amendment workflow — out of scope).

## 5. Schema Changes (one migration)

- `services_catalog`: add `entity_scope text not null default 'either'` + check constraint; backfill the 14 seeded codes.
- `quotes`: add `ported_to_company_id uuid references companies(id)`, `supersedes_quote_id uuid references quotes(id)`; widen status check to include `superseded`.
- `accountant_client_links`: add optional `relationship text` if not present (used to flag `self` linkages for shared portal access).
- New / replaced RPCs: `public_accept_quote_by_token`, `public_reject_quote_by_token`, `reissue_quote`. All `SECURITY DEFINER`, `anon` grant only on the two public ones.

## 6. Frontend Changes

- `src/pages/PublicQuoteView.tsx`: decline dialog with reason textarea; success copy mentions next steps + portal invite.
- `src/pages/QuoteDetail.tsx`: add `Re-Issue` action; show `Superseded by #...` banner when applicable.
- `src/components/quotes/PortQuoteToClientButton.tsx`: becomes read-only "View Client(s)" once the quote is accepted (handled automatically by the new RPC).
- No changes to `lifecycle_send_quote` (already templated).

## 7. Out of Scope

- Portal user invite email content (relies on existing onboarding email template).
- Amendments to already-accepted quotes (change orders) — separate future workflow.
- PDF attachment of the proposal.
