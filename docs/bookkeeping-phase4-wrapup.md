# Bookkeeping Phase 4 — Wrap-up

_Status: complete (2026-06-09)_

Phase 4 hardened the bookkeeping engine end-to-end: every write that touches
the ledger now goes through a `SECURITY DEFINER` RPC that enforces org
membership, locked-period guards, and writes to `bookkeeping_audit_log`.

## Slice index

| Slice | Theme | Key RPCs |
|---|---|---|
| 1 | Period locks + posting guard | `lock_period`, `unlock_period`, `assert_period_open` |
| 2 | Ledger SSOT + reversals | `post_to_ledger`, `reverse_journal` |
| 3 | Bank ingest + matching | `import_bank_statement`, `match_bank_transaction` |
| 4 | Receipts + bill posting | `attach_receipt`, `post_bill` |
| 5 | Invoices + customer payments | `post_invoice`, `record_invoice_payment` |
| 6 | Reconciliation hardening | `start_bank_reconciliation`, `add_reconciliation_line`, `remove_reconciliation_line`, `complete_bank_reconciliation`, `reopen_bank_reconciliation` |
| 7 | FX revaluation + balance integrity | `revalue_bank_account_fx`, `check_bank_balance_integrity` |
| 8 | Bank rules execution | `apply_bank_rule` (locked), `bulk_apply_active_bank_rules`, `revert_bank_rule_application` |

## Guarantees

1. **Single ledger path.** No client code inserts into `journals`/`journal_lines`
   directly. Every posting flows through `post_to_ledger` or a wrapper RPC.
2. **Locked-period guard.** All posting/mutating RPCs call `assert_period_open`
   on the effective date before any state change.
3. **Audit trail.** Each mutating RPC writes a `bookkeeping_audit_log` row with
   before/after state, actor, reason (where required), and the affected entity.
4. **Reconciliation integrity.** Recon completion enforces
   `closing − opening = Σ lines` to 0.005; `p_force` overrides are audited.
5. **Concurrency.** `apply_bank_rule` row-locks the transaction (`FOR UPDATE`)
   so concurrent invocations cannot double-post.
6. **Reversibility.** `reverse_journal`, `remove_reconciliation_line`,
   `reopen_bank_reconciliation`, and `revert_bank_rule_application` provide
   audited undo paths without breaking immutability of the original journal.

## Regression smoke checklist

Run against a seeded org with one company entity, one bank account, one open
period, one closed period, and one active bank rule.

- [ ] Post a manual journal in the open period → succeeds, audit row written.
- [ ] Post a manual journal in the closed period → rejected by `assert_period_open`.
- [ ] Import a 3-line statement → 3 `bank_transactions` rows, status `UNREVIEWED`.
- [ ] Apply matching rule → transaction `MATCHED`, journal posted, rule
      `times_applied` incremented, `bank_rule_executions` row written.
- [ ] Re-apply same rule on same transaction → rejected (already posted).
- [ ] Revert rule application with reason → journal reversed, transaction back
      to `UNREVIEWED`, audit row written.
- [ ] Start reconciliation, add the matched line, complete with correct totals
      → status `completed`, transaction `RECONCILED`.
- [ ] Reopen reconciliation with reason → transaction back to `MATCHED`.
- [ ] Run `check_bank_balance_integrity` → reports zero drift.
- [ ] Post a foreign-currency txn and run `revalue_bank_account_fx` with FX
      gain/loss accounts configured → gain/loss journal posted.

## Follow-ups (out of scope for Phase 4)

- UI surfaces for reconciliation reopen + FX revaluation (currently RPC-only).
- Period-end automation: scheduled FX reval + balance-integrity report.
- Portal-side review queue UX for `review_status='pending_review'` items
  (server-side wiring already complete in the portal write-policy work).