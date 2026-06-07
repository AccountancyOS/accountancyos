# Client-Facing Bookkeeping — Audit Report

Date: 2026-06-07. Scope: phase-1 read-only audit. No code changes were made.
Companion to `.lovable/plan.md`.

---

## 1. Executive summary

The accountant-side bookkeeping module is feature-complete across banking,
sales, purchases, VAT, COA, journals, TB, reports, and filing linkage.

The portal-side module was wired up in the previous batch
(`PortalBookkeepingFull` reuses every accountant tab via `PortalAppShim`,
sidebar is gated by `useAnyPortalBookkeepingAccess`, and a recent migration
added permissive "Portal bookkeeping full access" RLS policies on ~18
bookkeeping tables). That unblocks portal access end-to-end but **does not
match the brief's accountant-led model**:

1. Portal users currently see accountant-only tabs — Chart of Accounts,
   Journals, Bank Rules — and can mutate them.
2. RLS grants portal users `ALL` (insert/update/delete) on customers,
   suppliers, invoices, bills, credit notes, categorization rules, bank
   rules, and bank connections — there is no "review-first" enforcement,
   no draft / accountant-approval state machine on writes.
3. Granular permissions (the Phase-13 list in the brief) do not exist —
   `portal_visibility_settings` is the only knob and it covers visibility
   tiles only, not actions (explain, create invoice, approve VAT, etc.).
4. No client-facing Queries / Approvals / VAT-approval / Receipts hub
   pages exist; the receipts upload surface today is the raw accountant
   `ReceiptsTab`.
5. TrueLayer bank-connect still cannot be initiated from the portal
   (separate audit already saved in `.lovable/plan.md`).

No critical cross-tenant leakage was found. All bookkeeping tables have
RLS enabled and policies are scoped via `portal_can_access_bookkeeping`,
which itself joins `portal_access` to the entity's organization. The
risks are over-permissive writes and missing UI gating, not data
exposure across tenants.

Recommended next step: build sequence S1–S5 in section 9.

---

## 2. Accountant-side bookkeeping inventory

| Area | Status | Evidence |
|---|---|---|
| Bank accounts | Fully built | `bank_accounts`, `BankingTab`, `AddBankAccountDialog` |
| Bank feed (TrueLayer) | Partial | `bank_connections`, edge fns `truelayer-auth/callback/sync`. Connect dialog exists but is not rendered from `BankingTab` — see prior audit |
| Transactions list | Fully built | `bank_transactions`, transactions panel in `BankingTab` |
| Categorisation | Fully built | `CategorizeBankTransactionDialog`, posts via ledger flow |
| Bank rules | Fully built | `BankRulesTab`, `bank_rules`, `bank_rule_executions` |
| Matching | Fully built | `MatchingSuggestionsPanel`, `matching_candidates` |
| Sales invoices | Fully built | `InvoicesTab`, `InvoiceEditorDialog`, `invoices` + `invoice_lines` + `invoice_payments` |
| Customers | Fully built | `CustomersTab`, `CustomerEditorDialog`, `customers` |
| Credit notes | Fully built | `CreditNotesTab`, `credit_notes` |
| Bills / payables | Fully built | `BillsTab`, `BillEditorDialog`, `bills`/`bill_lines`/`bill_payments` |
| Suppliers | Fully built | `SuppliersTab` |
| Receipts | Fully built | `ReceiptsTab`, `receipts` |
| Chart of accounts | Fully built | `ChartOfAccountsTab`, `bookkeeping_accounts` |
| Manual journals | Fully built | `JournalsTab`, `JournalEditor`, `journals`/`journal_lines` |
| TB snapshots | Fully built | `TrialBalanceTab`, `trial_balance_snapshots`, `CreateSnapshotDialog` |
| Period locks | Fully built | `PeriodLockTab`, `period_locks` (admin-only RLS) |
| VAT registrations | Fully built | `VATRegistrationSettings`, `vat_registrations` |
| VAT periods / returns | Fully built | `VATPeriodsTab`, `VATReturnsTab`, `vat_periods`/`vat_returns` |
| VAT MTD submission | Fully built (sandbox) | edge fns `hmrc-vat-obligations`, `hmrc-vat-submit` |
| Reports (P&L, BS, aged) | Fully built | `ProfitLossReport`, `BalanceSheetReport`, `AgedReceivablesReport`, `AgedPayablesReport`, `ReportsTab` |
| Fixed assets | Fully built | `fixed_assets`, `fixed_asset_transactions` (no portal exposure) |
| Capital allowances | Backend only | `capital_allowance_*` tables; no UI tab in bookkeeping module |
| Workpaper/filing linkage | Fully built | TB-centric snapshots → workpapers → filings |

---

## 3. Portal-side bookkeeping inventory

`PortalBookkeeping` dispatches to `PortalBookkeepingFull` when the
entity has the bookkeeping service active; otherwise falls back to the
visibility-tile summary.

`PortalBookkeepingFull` renders the **accountant** tabs verbatim through
`PortalAppShim`. Tabs exposed today:

| Tab | Brief verdict | Notes |
|---|---|---|
| Overview | Keep | `BusinessOverviewTab` — needs client-friendly action cards (see Phase 3 in brief). Currently shows accountant KPIs. |
| Reports | Keep, gate by permission tier | No summary vs detail vs download split. Today: full reports. |
| Chart of Accounts | **Remove from portal** | Accountant-only per brief. |
| Journals | **Remove from portal** | Accountant-only per brief. |
| Banking | Keep | Reuses `BankingTab`. TrueLayer connect not rendered (see prior plan). |
| Bank Rules | **Remove from portal** | Accountant-only. |
| Sales | Keep, gate by `bookkeeping.invoices.create/send` | Full create/edit/void exposed today with no permission check. |
| Purchases | Keep, gate by `bookkeeping.bills.create` | Same — full create/edit. |
| Receipts | Keep, gate by `bookkeeping.transactions.upload_receipts` | Uses accountant `ReceiptsTab` — needs client-friendly hub (Phase 6). |
| VAT Returns | Keep when VAT-registered | Read-only intended but `VATReturnsTab` exposes accountant submit controls; needs portal-specific view + approval flow. |

**Missing surfaces vs brief:**

- Client Overview action cards (Phase 3) — transactions to explain, receipts missing, queries outstanding, draft invoices, unpaid invoices, bill backlog, VAT records-needed, period status. Not built.
- Client "explain transaction" workflow — accountant `CategorizeBankTransactionDialog` posts straight to ledger; there is no `client_explained` status, no review queue.
- Receipts hub (uploaded / matched / queried / accepted / archived statuses) — not built.
- VAT client approval flow (records-needed → approved → submitted) — not built.
- Accountant Queries inbox for clients — not built. (Brief Phase 11.)
- Inline customer-create inside portal invoice editor — exists in accountant editor; needs portal-permission check.
- Multi-entity switcher — `PortalEntityProvider` handles it; verified.

---

## 4. RLS matrix (bookkeeping tables)

All 41 bookkeeping-touching tables have `rowsecurity = t`. Cross-tenant
exposure is prevented by the org-membership policies and, for portal
users, by `portal_can_access_bookkeeping(entity_type, entity_id)` which
joins `portal_access` to the entity org.

The recent migration added a **permissive** `Portal bookkeeping full
access [ALL]` policy on the tables marked ✗ below — that grants portal
users insert/update/delete, which is not what the brief asks for.

| Table | Portal SELECT | Portal write | Brief expectation | Verdict |
|---|---|---|---|---|
| bank_accounts | ✓ scoped | ALL (permissive) | Read-only unless accountant grants connection management | ✗ over-permissive |
| bank_connections | ✓ org-only | ALL (permissive) | Start/restart only if permitted; never delete | ✗ over-permissive |
| bank_transactions | ✓ scoped | ALL (permissive) | Explain only, no raw insert/delete | ✗ over-permissive |
| bank_rules | (none portal-specific) | ALL (permissive) | Accountant-only | ✗ over-permissive |
| bank_rule_executions | org-only | org-only | Accountant-only | ✓ |
| categorization_rules | — | ALL (permissive) | Accountant-only | ✗ over-permissive |
| bookkeeping_accounts | ✓ scoped read | — | Read-only | ✓ |
| journals | ✓ scoped read | — | Read-only | ✓ |
| journal_lines | ✓ scoped read | — | Read-only | ✓ |
| ledger_entries | ✓ scoped read | — | Read-only | ✓ |
| customers | — | ALL (permissive) | Create/edit only if `invoices.create` | ✗ ungated |
| suppliers | — | ALL (permissive) | Create/edit only if `bills.create` | ✗ ungated |
| invoices, invoice_lines, invoice_payments | ✓ scoped read | ALL (permissive) | Create/send gated by perm; void via credit note only | ✗ ungated |
| credit_notes, credit_note_lines | — | ALL (permissive) | Should follow invoice perms | ✗ ungated |
| credit_note_allocations | — | — (org-only ALL) | Accountant-only | ✓ |
| bills, bill_lines, bill_payments | — | ALL (permissive) | Create only if `bills.create`; payment recording accountant-only | ✗ ungated |
| receipts | — | ALL (permissive) | Upload only if `transactions.upload_receipts` | ✗ ungated (broadly correct, needs perm check) |
| vat_codes | — | — | Read-only | ✓ |
| vat_periods, vat_returns | ✓ scoped read | — | Read-only; approve via dedicated RPC | ✓ |
| vat_adjustments, vat_period_lines, vat_obligations, vat_registrations, vat_reconciliations, vat_transaction_links | — | — | Accountant-only | ✓ |
| tb_account_mappings, period_locks, fixed_assets, fixed_asset_transactions, reconciliations, reconciliation_lines, matching_candidates | — | — | Accountant-only | ✓ |
| trial_balance_snapshots | ✓ scoped read | — | Read-only | ✓ |
| fx_rates | authenticated read | service_role write | OK | ✓ |
| bookkeeping_audit_log | org read | system insert | Append-only | ✓ |

**Critical gap:** the blanket `ALL` policies were appropriate to unblock
the portal experience but predate the granular-permissions decision.
They must be tightened to per-action policies driven by
`portal_visibility_settings` columns added in build phase.

No cross-tenant access paths were found. `portal_can_access_bookkeeping`
strictly compares the entity's `organization_id` to the caller's
`portal_access` rows.

---

## 5. Permissions gap list

Mapping every Phase-13 permission to the current source. "Add" = new
boolean column on `portal_visibility_settings` in the build migration.

| Permission | Current source | Action |
|---|---|---|
| `bookkeeping.view` | Service active (`portal_has_bookkeeping`) | Keep |
| `bookkeeping.bank.view` | `show_bank_accounts` | Reuse |
| `bookkeeping.bank.manage_connection` | — | **Add** `allow_bank_connect` |
| `bookkeeping.transactions.view` | `show_transactions` | Reuse |
| `bookkeeping.transactions.explain` | — | **Add** `allow_transaction_explain` |
| `bookkeeping.transactions.upload_receipts` | — | **Add** `allow_receipt_upload` |
| `bookkeeping.invoices.view` | `show_invoices` | Reuse |
| `bookkeeping.invoices.create` | — | **Add** `allow_invoice_create` |
| `bookkeeping.invoices.send` | — | **Add** `allow_invoice_send` |
| `bookkeeping.bills.view` | — | **Add** `show_bills` |
| `bookkeeping.bills.create` | — | **Add** `allow_bill_create` |
| `bookkeeping.vat.view` | `show_vat_position` (tile) | **Add** `show_vat_returns` (page-level) |
| `bookkeeping.vat.approve` | — | **Add** `allow_vat_approval` |
| `bookkeeping.reports.view_summary` | — | **Add** `show_reports_summary` |
| `bookkeeping.reports.view_detail` | — | **Add** `show_reports_detail` |
| `bookkeeping.reports.download` | — | **Add** `allow_reports_download` |

11 new boolean columns on `portal_visibility_settings`. Defaults:
`allow_*` → `false`, `show_*` → `false`, conservative. Accountant
enables in `ClientPortalTab` UI.

---

## 6. UX gap list

| Brief surface | Status | Build approach |
|---|---|---|
| Bookkeeping Overview action cards (Phase 3) | Missing | New `PortalBookkeepingOverview` component — query: uncategorised count, missing receipts, open queries, draft invoices, unpaid invoices, bills awaiting review, VAT next deadline. Reuse `BusinessOverviewTab` selectors. |
| Bank tab (client friendly) | Partial | Wrap `BankingTab` in portal container; hide manual delete/add; expose Connect Bank only when `allow_bank_connect`. |
| Transactions explain workflow | Missing | New `PortalTransactionExplainDialog` — sets `bank_transactions.status = 'client_explained'` + writes `categorization_rules` suggestion + writes `bookkeeping_audit_log`. Does NOT post to ledger. Accountant review queue is the existing `CategorizeBankTransactionDialog`. |
| Receipts hub | Missing | New `PortalReceiptsHub` listing receipts grouped by status. Reuses `receipts` table; adds `review_status` column if not present. |
| Sales invoices (client) | Partial | Reuse `InvoiceEditorDialog` behind `allow_invoice_create`; hide void/delete; allow inline customer create behind same perm. |
| Bills (client) | Partial | Reuse `BillEditorDialog` behind `allow_bill_create`; payments hidden. |
| VAT client view + approval | Missing | New `PortalVATPanel` — read-only status timeline + Approve button when accountant publishes a return for approval. Adds `vat_returns.client_approval_*` columns and `portal_approve_vat_return` RPC. |
| Reports (tiered) | Partial | Wrap `ReportsTab` — hide downloads unless `allow_reports_download`; restrict to summary set unless `show_reports_detail`. |
| Accountant Queries inbox | Missing | New `client_messages` (already exists) thread filtered by `category='bookkeeping_query'`; portal view + response. Integrates with jobs/tasks via existing `message_entity_links`. |
| Audit trail | Partial | `bookkeeping_audit_log` exists; portal actions don't log today. Add `log_portal_bookkeeping_action` SEC DEF RPC. |

---

## 7. Security risks

**High**

- H1. Portal users can DELETE bank connections (`bank_connections` ALL
  policy). A client could orphan their own feed and the accountant
  would have to reconnect.
- H2. Portal users can DELETE invoices and bills, breaking VAT
  accountancy trails. Brief mandates void/credit-note instead.
- H3. Portal users can INSERT `bank_rules` and `categorization_rules`,
  which the accountant relies on for automated posting. A client could
  inject rules that mis-post historical transactions.
- H4. `Portal bookkeeping full access` on `bank_transactions` allows
  client to mutate raw bank feed rows (description, amount). Bank-feed
  immutability is an accountancy control.

**Medium**

- M1. No portal-action audit logging — `bookkeeping_audit_log` is only
  written by accountant-side flows.
- M2. `VATReturnsTab` reused in portal exposes submit buttons; gated by
  RLS but the UI affordance is wrong for clients.
- M3. Inline customer-create through portal invoice editor would let a
  client populate the customer master with no review.

**Low**

- L1. `PortalAppShim` synthesises an `organization_id` for the entity;
  any future accountant component that calls a write RPC keyed to that
  org will succeed silently — keep the shim minimal.
- L2. Aggregated `useAnyPortalBookkeepingAccess` makes one RPC per
  entity. Fine at low N; consider a single bulk RPC if a client has 10+
  entities.

No cross-tenant or PII-leak issues were found.

---

## 8. Architectural concerns

- A1. Reusing accountant tabs verbatim couples portal UX to accountant
  internals. Recommend a thin `PortalBookkeepingShell` that wraps each
  reused component with a `<PortalActionGate permission="...">` HOC and
  hides controls the client should not see. Avoid forking the
  components.
- A2. `bank_transactions.status` does not currently include a
  `client_explained` state. Adding it requires updating the accountant
  review queue too.
- A3. VAT approval needs an authoritative record. Recommend adding
  `vat_returns.client_approval_required`, `client_approved_at`,
  `client_approved_by`, with a single SEC DEF RPC
  `portal_approve_vat_return` to set them and write
  `bookkeeping_audit_log`. Submission to HMRC remains accountant-only.
- A4. Queries — the brief asks for a query inbox tied to transactions /
  receipts / bills / invoices / VAT. `client_messages` +
  `message_entity_links` already supports generic links; the right
  pattern is a `bookkeeping_query` message category plus a portal
  filtered view, not a new table.
- A5. `PortalAppShim` works but should make `useOrganization` return
  `null` for any caller that doesn't need it; tighten to fail-fast on
  unexpected mutations.

---

## 9. Recommended build sequence

Each row is an independently shippable batch. Sizes: S < 0.5 day, M ≈
1 day, L ≈ 2+ days of focused work.

| # | Batch | Size |
|---|---|---|
| S1 | Tighten RLS: drop blanket `Portal bookkeeping full access` ALL policies; replace with per-action policies keyed to new `portal_visibility_settings` columns. Add `vat_returns.client_approval_*` columns. Add `bank_transactions` `client_explained` status. | L |
| S2 | Extend `portal_visibility_settings` with the 11 new boolean columns; add accountant UI in `ClientPortalTab` to manage them. | M |
| S3 | Portal nav + tab gating: remove Chart of Accounts / Journals / Bank Rules from `PortalBookkeepingFull`. Wrap remaining tabs in `PortalActionGate`. Render TrueLayer connect dialog with portal redirect (also fixes the prior plan). | M |
| S4 | Build client surfaces: Overview action cards, Receipts hub, Transactions explain workflow, Queries inbox, VAT approval panel. | L |
| S5 | Seed Greenfield fixtures + run QA matrix (7 client scenarios from brief) + write QA report. | M |

Critical path: S1 → S2 → S3. S4 can start in parallel with S3 once S2
lands. TrueLayer rendering folds into S3.

---

## 10. Out of scope (for the build phase)

- HMRC MTD production switch (still sandbox-only — see memory `hmrc-filing-sandbox-constraint`).
- Companies House production keys (memory `companies-house-sandbox-constraint`).
- Capital allowances UI (backend-only today; no portal need yet).
- Fixed-asset client surfaces.
- Bank-feed reconnect UX (covered by separate plan).
- Auto-posting mode for client explanations — default is review-first per your direction; opt-in toggle deferred.
- Bulk receipt OCR.