## Client Bookkeeping — Operational Layer (Risk-Based Review Model)

Reset of the previous review-heavy plan. The portal must behave like Xero/QBO for the client: ordinary actions happen immediately. Accountant control comes from configurable risk-based review modes, period locks, VAT/filing gates and a review queue — **not** from forcing every write into an approval pipeline.

### Operating model

```text
Client operational bookkeeping
      ↓ (audit + provenance)
Accountant visibility & review controls
      ↓ (queries, edits, accepts)
Accountant period close / VAT / accounts / filings
```

Three accountant-configurable modes per surface:
- **Operational** — client writes post immediately. Accountant reviews later.
- **Review-required** — client writes are saved but flagged `pending_review`; effects on VAT/send/post deferred until accountant accepts.
- **Accountant-only** — client view/respond/upload only.

Default profile (recommended, accountant can change):

| Surface | Default mode | Why |
|---|---|---|
| Transaction explain | Operational (review before VAT close) | Volume; review at period end |
| Receipts upload + match | Operational | Low risk |
| Sales invoices create | Operational | Client owns sales |
| Sales invoices send | Operational, gated by `requires_send_approval` setting (off by default) | Some practices want sign-off |
| Bills create/upload | Review-required | Affect VAT/costs; clients miscode |
| VAT view | Operational | View only |
| VAT approval | Review-required when accountant requests it | Sign-off flow |
| VAT submit | Accountant-only | Never client |
| Period close / lock dates | Accountant-only | Never client |
| Journals / workpapers / filings | Accountant-only | Never client |

### Data model — operational vs review status (kept separate)

Do not overload existing operational statuses (invoice `draft|sent|paid`, bill `draft|approved|paid`, transaction `unexplained|explained|matched|reconciled`). Add a parallel review layer.

**New columns on `invoices`, `bills`, `bank_transactions`, `receipts`, `vat_returns`:**
- `review_status` enum: `not_required | pending_review | approved | queried | rejected | edited_by_accountant` (default `not_required`)
- `reviewed_by uuid`, `reviewed_at timestamptz`, `review_notes text`, `review_action text`
- `source text` (`portal` | `accountant`), `created_by_contact_id uuid`, `created_by_portal boolean` (already exists on some)

**New `bookkeeping_query` table** (lightweight join over existing `client_messages` + `message_entity_links` where possible — only add a dedicated table if those can't carry status/resolution):
- `object_type`, `object_id`, `client_id`/`company_id`, `status` (`open|answered|resolved|closed`), `assigned_to`, `priority`, links to `job_id`/`task_id`/`deadline_id` when relevant.

### Settings — per org, per client/entity, per service

Extend `portal_visibility_settings` (and an org-level defaults row in `org_settings`):

```
client_bookkeeping_mode: operational | review_required | accountant_only
require_review_for_transaction_explanations: bool
require_review_for_invoice_sending: bool      -- gates 'send' only, not 'create'
require_review_for_bill_approval: bool        -- default true
require_review_for_receipt_matching: bool     -- default false
require_vat_client_approval: bool
allow_client_reconcile: bool
allow_client_post_to_ledger: bool             -- default false
```

Resolution order: contact → client/entity → service → org default. The existing `Full Bookkeeping Access` master toggle is repurposed as a shortcut that sets all surfaces to **Operational** with review flags off (kept for backward compatibility with the previous turn's row).

### Permissions — extend, enforce in RLS/RPCs

Add to `portal_has_perm` and corresponding RLS:
```
bookkeeping.transactions.explain / .reconcile
bookkeeping.invoices.create / .send
bookkeeping.bills.create / .approve
bookkeeping.receipts.upload / .match
bookkeeping.customers.create / .suppliers.create
bookkeeping.vat.view / .approve            -- submit is never portal
bookkeeping.queries.respond
bookkeeping.reports.view_summary / .view_detail / .download
```
Accountant-only (no portal grant ever):
```
periods.close, lock_dates.manage, journals.create,
vat.submit, filings.submit, workpapers.finalise, org.settings
```

RLS enforces both the permission and the operational/review-mode setting (e.g. an invoice with `require_review_for_invoice_sending=true` cannot transition `status` to `sent` from a portal session; only `pending_review` accepted by an accountant unlocks it).

### Audit / provenance

Every portal mutation writes to `bookkeeping_audit_log` with: `object_type`, `object_id`, `entity_id`, `organisation_id`, `created_by_portal=true`, `created_by_contact_id`, `created_by_user_id`, `source='portal'`, `previous_value`, `new_value`, timestamps. Accountant edits to client-created rows also capture `reviewed_by`, `reviewed_at`, `review_action`, `review_notes`.

### Portal UX language

Status pills use plain operational language. Review chip only appears when review is actually required:
`Saved · Submitted For Review · With Accountant · Query From Accountant · Approved · Rejected`

The portal never shows a "submitted into a black hole" empty state — operational records appear normally; review chip is supplementary.

### Accountant review queue (control surface, not bottleneck)

New `Review Queue` tab on `Bookkeeping.tsx`. Sections, each filterable by client/entity, type, date, VAT period, assigned staff, risk:
- Client-submitted bills (`pending_review`)
- Queried transactions
- Unreviewed transaction explanations (only when mode requires)
- Receipts requiring attention
- Invoices awaiting send approval (only when `requires_send_approval`)
- VAT returns awaiting client approval
- Open bookkeeping queries (client responses)

Row actions: Accept · Edit And Accept · Reject · Query Client · Mark Reviewed · Open Source Record.

### Audit of current state (to confirm in build step 1)

| Area | Current portal write | Permission-gated | RLS enforced | Audit logged | Reviewable | Action |
|---|---|---|---|---|---|---|
| Bank connect | Yes | Yes | Yes | Partial | n/a | Keep operational |
| Transaction explain | Yes (direct post) | Yes | Yes | Partial | No | Add review_status + provenance |
| Receipts upload/match | Reused UI, unclear | Partial | Partial | Partial | No | Confirm + audit |
| Invoices create/send | Yes if perm | Yes | Yes | Partial | No | Add `requires_send_approval` gate |
| Bills create | Yes if perm | Yes | Yes | Partial | No | Add default review-required |
| VAT view/approve | View ok; approve missing | Partial | Partial | No | n/a | Build approval action |
| Queries | `PortalQueriesPanel` exists | n/a | n/a | n/a | n/a | Wire two-way + entity links |
| Period locks / journals / VAT submit / filings | No portal write | n/a | n/a | n/a | n/a | Keep accountant-only |

### Out of scope

- Client-side bank rules editor
- Recurring invoices in portal
- Multi-currency UI changes
- Production TrueLayer keys
- New report templates

### Technical notes

- Operational status columns are untouched; review columns added in parallel.
- Mode resolution implemented as a SQL function `portal_bookkeeping_mode(_client_id, _company_id, _surface)` used by both RLS and the portal hook so client and server agree.
- `portal_has_perm` extended with the new keys; the existing master toggle short-circuit remains.
- `vat.submit`, `filings.submit`, `periods.close`, `lock_dates.manage`, `journals.create`, `workpapers.finalise` are hard-coded `false` in `portal_has_perm` regardless of settings — defensive against future bugs.
- Trigger guards on `vat_returns`, `period_locks`, `journals` reject any update made under `is_portal_user()`.

### Build order

1. **Audit pass** — produce a short report in `docs/portal-bookkeeping-write-audit.md` filling the table above with verified RLS/audit findings before writing migrations.
2. **Migration A — settings & modes**: add mode + per-surface review settings to `portal_visibility_settings` and org defaults; add `portal_bookkeeping_mode()` resolver.
3. **Migration B — review layer**: add `review_status` + reviewer columns to invoices, bills, bank_transactions, receipts, vat_returns. Add the `bookkeeping_query` table (or extend `message_entity_links`) with grants + RLS.
4. **Migration C — RLS hardening**: extend `portal_has_perm` with new keys; harden write policies; add accountant-only guards; add provenance triggers across all surfaces (currently only on `ledger_entries`/`invoice_payments`/`bill_payments`).
5. **Accountant UI**: settings panel reorganised into modes + per-surface review toggles; Review Queue tab with the seven sections and the row actions; "Request Client Approval" action on VAT returns.
6. **Portal UI**: status pills, plain operational labels, surface review chip only when applicable; wire two-way queries with attachments and status; VAT approval action.
7. **Notifications**: handoffs both directions.
8. **Docs & memory**: update `docs/portal-disabled-features.md`; replace `mem://constraints/portal-bookkeeping-write-policy` with a new memory describing the risk-based model and the hard accountant-only list.
9. **QA**: log in as Amy-Lee and run two passes — Operational defaults (Xero-like) and Review-required mode — verifying RLS, audit rows, queue population, and the accountant-only guardrails.

### Acceptance

- Client can do day-to-day bookkeeping without an approval gate when accountant leaves defaults.
- Accountant can flip any surface into review-required and the portal honours it without breaking operational status fields.
- VAT submission, period close, lock dates, journals, workpaper finalisation and filings cannot be performed from a portal session — verified by RLS test and trigger guard.
- Every portal mutation has a row in `bookkeeping_audit_log` with full provenance.
- Review queue lists all items the accountant should see and nothing they should not.
- Existing accountant bookkeeping flows unchanged.