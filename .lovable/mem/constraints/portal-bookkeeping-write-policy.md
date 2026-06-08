---
name: Portal Bookkeeping Write Policy (Risk-Based Review Model)
description: Operational/review-required/accountant-only modes with hard accountant-only gates and full provenance
type: constraint
---
Client portal bookkeeping uses a risk-based review model — not a blanket approval queue.

Three modes per entity (`portal_visibility_settings.client_bookkeeping_mode`):
- `operational` — client writes post immediately (default). Like Xero/QBO.
- `review_required` — client writes save with `review_status='pending_review'` and surface in the accountant Review Queue.
- `accountant_only` — client view/respond/upload only.

Per-surface review flags override the mode for specific workflows:
- `require_review_for_transaction_explanations` (default false)
- `require_review_for_invoice_sending` (default false)
- `require_review_for_bill_approval` (default true — bills affect VAT)
- `require_review_for_receipt_matching` (default false)
- `require_vat_client_approval` (default false; accountant requests sign-off)

Parallel review layer on `invoices`, `bills`, `bank_transactions`, `receipts`, `vat_returns`:
`review_status` enum (`not_required|pending_review|approved|queried|rejected|edited_by_accountant`), `reviewed_by`, `reviewed_at`, `review_action`, `review_notes`. Operational status columns are NEVER overloaded with review state.

`portal_has_perm` extensions:
- New keys: `allow_customer_create`, `allow_supplier_create`, `allow_receipt_match`, `allow_query_respond`, `allow_client_reconcile`, `allow_client_post_to_ledger`.
- Hard accountant-only — always returns false regardless of settings: `vat.submit`, `filings.submit`, `periods.close`, `lock_dates.manage`, `journals.create`, `workpapers.finalise`, `org.settings`.

Defensive triggers (`block_portal_writes`, `block_portal_vat_submit`) reject any portal-session write to `period_locks`, `journals`, `journal_lines`, and VAT submission fields on `vat_returns`.

Provenance trigger `stamp_portal_provenance` runs on `invoices`/`bills`/`bank_transactions`/`receipts`:
- Stamps `source='portal'`, `created_by_portal=true`/`updated_by_portal=true`, `created_by_contact_id`.
- Sets `review_status='pending_review'` if the entity's mode or relevant per-surface flag requires it.
- Writes a row to `bookkeeping_audit_log` with full before/after state.

`bookkeeping_queries` table links accountant questions to specific objects (`object_type`, `object_id`) with status (`open|answered|resolved|closed`), priority, attachment_path, and optional `job_id`/`task_id`/`deadline_id` links. Accountants own the row; portal users (with `allow_query_respond`) can update only their linked client/company rows.

The previous "Full Bookkeeping Access" master toggle still exists as a shortcut equivalent to mode=operational with all review flags off.
