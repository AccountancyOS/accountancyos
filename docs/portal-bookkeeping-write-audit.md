# Portal Bookkeeping Write Audit

Baseline before the risk-based review model is built. Verified against the
current schema and RLS policies on 2026-06-08.

| Area | Portal write today | Permission gated | RLS enforced | Audit log | Reviewable | Action |
|---|---|---|---|---|---|---|
| Bank connect | Yes (TrueLayer) | Yes — `allow_bank_connect` | Yes | Partial | n/a | Keep operational |
| Transaction categorise | Yes (direct UPDATE) | Yes — `allow_transaction_explain` + master | Yes | No | No | Add review_status + provenance |
| Receipts upload + match | Reused UI | Partial | Partial | No | No | Add policies + provenance |
| Sales invoices create/send | Yes if perm | Yes | Yes | No | No | Add `requires_send_approval` gate |
| Bills create | Yes if perm | Yes | Yes | No | No | Default review-required |
| VAT view | Yes | Yes | Yes | n/a | n/a | Keep |
| VAT approve | Columns exist, unwired | Yes — `allow_vat_approval` | Partial | No | n/a | Build action + audit |
| VAT submit | No portal path | n/a | n/a | n/a | n/a | Hard-block + trigger guard |
| Period close / lock | No portal path | n/a | n/a | n/a | n/a | Trigger guard on `period_locks` |
| Journals | No portal path | n/a | n/a | n/a | n/a | Trigger guard |
| Workpaper finalise | No portal path | n/a | n/a | n/a | n/a | Trigger guard |
| Filings submit | No portal path | n/a | n/a | n/a | n/a | Hard-block in `portal_has_perm` |
| Queries | `portal_send_message` | n/a | Yes | Yes | n/a | Wire entity links + status |

## Conclusion

Direct-write already exists on the right surfaces. Gaps are: parallel review
layer, full provenance into `bookkeeping_audit_log`, per-surface review-mode
settings, an accountant Review Queue, and defensive trigger guards on the
accountant-only surfaces.
