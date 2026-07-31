# DEF-001 / DEF-002 — signature and caller matrix

Companion to `supabase/migrations/20260731210000_def_001_002_rpc_context_and_invoice_draft.sql`.
Evidence: LIVE sweep of all 368 public function bodies (`mcp_list_functions`, 2026-07-31),
plus the executor's unrestricted `pg_proc` inventory (2026-07-31T20:15:16Z).

---

## 1. DEF-001 — the count is eight

| Source | Result |
|---|---|
| Repository (5 migrations mentioning the helper, both `CREATE FUNCTION` and `CREATE OR REPLACE FUNCTION` forms) | 15 names ever called it |
| LIVE sweep of 368 function bodies | 8 still call it; 10 instances already inline `set_config` |
| Executor `pg_proc`, `calls_helper` column | exactly the same 8; no LIVE-only caller |

**The audit's "ten" is unsupported and is corrected to eight.** Two capabilities the audit
named as broken are not: invoice drafting (all four overloads already inlined) and supplier
payment via `record_invoice_payment_safe`. DEF-002's claim that one invoice-draft overload
"contains the DEF-001 failure" is likewise unsupported — that defect is a pure signature
collision.

`update_bill_draft_safe` (`23eac9e3`) is inlined on LIVE although its git definition never
referenced the helper: the December remediation touched one more function than the
repository records. Drift in the harmless direction; recorded, not acted on.

### The eight repaired

All `SECURITY DEFINER`, `SET search_path TO 'public'`, `RETURNS jsonb`, `VOLATILE`,
owner `postgres`. Each has exactly one line changed.

| Function | Signature | Hash before |
|---|---|---|
| `create_automation_rule_safe` | `(uuid,text,text,jsonb,text,jsonb,boolean,text)` | `de32451b` |
| `update_automation_rule_safe` | `(uuid,text,text,jsonb,text,jsonb,boolean,text)` | `3803ae13` |
| `toggle_automation_rule_safe` | `(uuid,boolean)` | `dbe752a5` |
| `delete_automation_rule_safe` | `(uuid)` | `1ef6b7fc` |
| `approve_bill_safe` | `(uuid)` | `75551314` |
| `void_bill_safe` | `(uuid,text)` | `cc7973c4` |
| `record_bill_payment_safe` | `(uuid,numeric,date,uuid,text,text)` | `2dbb0171` |
| `create_customer_safe` | `(uuid,text,uuid,text,text,text,jsonb,text,text,integer,text,text)` | `1ca6a433` |

---

## 2. DEF-002 — signature disposition

| Signature | Disposition | Rationale |
|---|---|---|
| `create_invoice_draft_safe(uuid,text,uuid,text,uuid,text,text,text,date,date,text,text,jsonb)` — 13 args, `date` dates, no `p_contact_email` | **DROPPED** | Its key set is a subset of the canonical 14-arg. Carried the portal branch, which is merged into the canonical rather than lost. |
| `create_invoice_draft_safe(...,text,text,...)` — 14 args, `text` dates, `p_contact_email` | **REPLACED (canonical)** | Matches the service payload exactly. Stricter implementation (raises, bounds checks, `remaining_balance`). |
| `update_invoice_draft_safe(uuid,uuid,text,text,date,date,text,jsonb)` — 8 args, has `p_notes` | **DROPPED** | Returns `{success:false}` instead of raising; OpsHealth asserts a raise. |
| `update_invoice_draft_safe(uuid,uuid,text,text,text,text,text,jsonb)` — 8 args, has `p_contact_email` | **DROPPED** | Superseded by the canonical, which is its body plus `p_notes` and the portal branch. |
| `update_invoice_draft_safe(uuid,uuid,text,text,text,text,text,text,jsonb)` — **9 args** | **CREATED (canonical)** | The union the client already sends. |

### Why a new signature was unavoidable

`invoice-draft-service.ts` sends nine keys to update: `p_invoice_id, p_customer_id,
p_contact_name, p_contact_email, p_reference, p_issue_date, p_due_date, p_notes, p_lines`.
The first 8-arg overload has `p_notes` but not `p_contact_email`; the second the reverse.
The payload is a **superset of both**, so PostgREST answers `PGRST203`. Dropping one would
have produced `PGRST202` instead. The defect was never "two candidates" — the client was
calling a signature that did not exist.

---

## 3. Caller / payload resolution

| Caller | RPC | Payload keys | Resolves to | Ambiguous? |
|---|---|---|---|---|
| `src/lib/invoice-draft-service.ts:55` | create | 14 | canonical 14-arg | No — exact match |
| `src/pages/OpsHealth.tsx:422/474/549/623` | create | 4 (`p_organization_id, p_entity_type, p_entity_id, p_lines`) | canonical 14-arg | No — subset; remaining 11 defaulted |
| `src/lib/invoice-draft-service.ts:90` | update | 9 | canonical 9-arg | No — exact match |
| `src/pages/OpsHealth.tsx:650` | update | 2 (`p_invoice_id, p_lines`) | canonical 9-arg | No — subset; remaining 7 defaulted |
| `src/lib/bills-safe-service.ts` | `approve_bill_safe`, `void_bill_safe`, `record_bill_payment_safe` | 1 / 2 / 6 | single signature each | No |
| `src/lib/customer-safe-service.ts` | `create_customer_safe` | 12 | single signature | No |
| `src/lib/automation-rule-service.ts` | 4 automation RPCs | 8 / 8 / 2 / 1 | single signature each | No |

**No compatibility wrappers are required, and this is the evidence for it.** PostgREST
resolves a named-argument call whenever the payload's keys are a subset of a candidate's
parameters. Every parameter but the first carries a `DEFAULT`, and all four observed invoice
payloads are subsets of exactly one surviving candidate. A wrapper would add a second place
for authorisation logic to drift — the precise failure mode DEF-002 already demonstrates.

---

## 4. Ownership and privileges

Pre-migration, every one of the twelve signatures: owner `postgres`, ACL
`{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec=X/postgres}`.

`=X` is PUBLIC EXECUTE. These are privileged `SECURITY DEFINER` functions that create
customers, approve bills, record payments and delete automation rules — all reachable by
`anon`. They are **not** exploitable: each rejects a null `auth.uid()` internally, which is
why they fall outside DEF-015's 93. But it is the same unreviewed-default pattern that put
`el_signature_progress` on that list.

After migration, for all ten created/replaced signatures: owner `postgres`; `PUBLIC` and
`anon` revoked; `authenticated` and `service_role` granted explicitly. **`sandbox_exec` is
left untouched** — it is executor infrastructure and outside this repair's remit.

> **Behaviour change.** An anonymous caller previously received
> `{"success":false,"error":"Not authenticated"}`; it will now receive a hard permission
> denied. No legitimate caller is affected — portal users authenticate and hold
> `authenticated`.

---

## 5. Intentional tightening

`update_invoice_draft_safe` now requires `can_create_invoices` for the staff path. Both
previous overloads required organisation membership only. **An organisation member without
that capability could previously edit draft invoices and no longer can.** This is the single
change in the family that is not a strict repair, and it is the most likely source of a
"regression" report after deployment.

Also added, present in neither overload: create verifies the entity belongs to the
organisation, and both verify that a supplied `p_customer_id` belongs to the invoice's
organisation. Without the latter, another tenant's customer could be attached to an invoice.

---

## 6. Portal capability

Preserved per the owner's ruling. Portal clients may create and edit **their own draft**
invoices when granted `allow_invoice_create`, matching the existing `invoices` RLS policies
("Portal clients can create draft invoices", "Portal clients can edit draft invoices").
Portal authority does not extend to approval, posting, voiding, payment recording, or any
other client's invoice or customer — those live in separate RPCs, untouched here.
