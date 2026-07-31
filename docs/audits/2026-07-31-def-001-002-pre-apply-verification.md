# DEF-001 + DEF-002 — Pre-Apply Verification

Status: **NOT APPLIED.** Nothing in this document changed LIVE. All observations are
read-only catalogue queries and unauthenticated API probes.

Migration under review: `supabase/migrations/20260731210000_def_001_002_rpc_context_and_invoice_draft.sql`
sha256 `aee9c160b5594b2748db7434c8397d22fd7e13100803204e1d04ba6cdf4830f5` (re-verified in tree).

---

## 1. Corrected verification language

The phrase "all ten affected signatures" is **not** the disproven audit claim of ten broken
helper callers. The ten are:

**Group A — eight repaired helper-calling signatures** (each had `PERFORM public.set_rpc_context()`
inlined to `PERFORM set_config('app.rpc','1',true)`):

1. `create_automation_rule_safe(uuid,text,text,jsonb,text,jsonb,boolean,text)`
2. `update_automation_rule_safe(uuid,text,text,jsonb,text,jsonb,boolean,text)`
3. `toggle_automation_rule_safe(uuid,boolean)`
4. `delete_automation_rule_safe(uuid)`
5. `approve_bill_safe(uuid)`
6. `void_bill_safe(uuid,text)`
7. `record_bill_payment_safe(uuid,numeric,date,uuid,text,text)`
8. `create_customer_safe(uuid,text,uuid,text,text,text,jsonb,text,text,integer,text,text)`

**Group B — two resulting canonical invoice-draft signatures** (neither ever called the helper;
these are the DEF-002 collision, not a DEF-001 failure):

9. `create_invoice_draft_safe(uuid,text,uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb)` — 14 args, replaced in place
10. `update_invoice_draft_safe(uuid,uuid,text,text,text,text,text,text,jsonb)` — 9 args, **newly created**

Eight repaired + two canonical = ten touched. The live count of helper callers was and remains
**eight**.

---

## 2. Exact ACL matrix

### 2.1 Pre-migration (LIVE inventory, all twelve signatures identical)

```
owner    = postgres
proacl   = {=X/postgres, postgres=X/postgres, anon=X/postgres,
            authenticated=X/postgres, service_role=X/postgres, sandbox_exec=X/postgres}
volatility = VOLATILE, SECURITY DEFINER, SET search_path TO 'public', RETURNS jsonb
```

### 2.2 Statements the migration actually executes

Part 4 loops over ten signatures and runs, for each:

```sql
ALTER FUNCTION <sig> OWNER TO postgres;
REVOKE ALL ON FUNCTION <sig> FROM PUBLIC;
REVOKE ALL ON FUNCTION <sig> FROM anon;
GRANT EXECUTE ON FUNCTION <sig> TO authenticated, service_role;
```

There is **no `GRANT ... TO sandbox_exec` anywhere in the migration.**

### 2.3 Intended final ACL for each of the ten

| # | Signature | PUBLIC | anon | authenticated | service_role | sandbox_exec | owner |
|---|---|---|---|---|---|---|---|
| 1 | `create_automation_rule_safe(uuid,text,text,jsonb,text,jsonb,boolean,text)` | revoked | revoked | EXECUTE | EXECUTE | **retained** | postgres |
| 2 | `update_automation_rule_safe(uuid,text,text,jsonb,text,jsonb,boolean,text)` | revoked | revoked | EXECUTE | EXECUTE | **retained** | postgres |
| 3 | `toggle_automation_rule_safe(uuid,boolean)` | revoked | revoked | EXECUTE | EXECUTE | **retained** | postgres |
| 4 | `delete_automation_rule_safe(uuid)` | revoked | revoked | EXECUTE | EXECUTE | **retained** | postgres |
| 5 | `approve_bill_safe(uuid)` | revoked | revoked | EXECUTE | EXECUTE | **retained** | postgres |
| 6 | `void_bill_safe(uuid,text)` | revoked | revoked | EXECUTE | EXECUTE | **retained** | postgres |
| 7 | `record_bill_payment_safe(uuid,numeric,date,uuid,text,text)` | revoked | revoked | EXECUTE | EXECUTE | **retained** | postgres |
| 8 | `create_customer_safe(uuid,text,uuid,text,text,text,jsonb,text,text,integer,text,text)` | revoked | revoked | EXECUTE | EXECUTE | **retained** | postgres |
| 9 | `create_invoice_draft_safe(...,14 args, text dates)` | revoked | revoked | EXECUTE | EXECUTE | **retained** | postgres |
| 10 | `update_invoice_draft_safe(...,9 args)` — NEW | revoked | revoked | EXECUTE | EXECUTE | **NONE** | postgres |

Rows 1–9 retain `sandbox_exec` because it is an independent grantee: `REVOKE ... FROM PUBLIC`
and `REVOKE ... FROM anon` do not touch it, and `CREATE OR REPLACE FUNCTION` preserves the
existing ACL of an existing function.

### 2.4 Finding — sandbox_exec asymmetry on the new signature (needs an owner ruling)

Row 10 is a **new** signature. It has no historical ACL to preserve, so "untouched" is
meaningless for it. It is created with the default implicit PUBLIC EXECUTE, then Part 4
revokes PUBLIC and grants only `authenticated` and `service_role`. `sandbox_exec` therefore
ends with **no EXECUTE on the canonical update**, while holding EXECUTE on the canonical
create and on all eight repaired functions.

Consequences: any diagnostic or infrastructure path running as `sandbox_exec` can create an
invoice draft but not update one. This is an unintended inconsistency, not a deliberate
tightening — the migration never states an intent for `sandbox_exec` either way.

Two coherent resolutions, both one line, both requiring a checksum change and Claude's
re-review:

- **(a) Symmetry-preserving:** add `GRANT EXECUTE ON FUNCTION public.update_invoice_draft_safe(uuid,uuid,text,text,text,text,text,text,jsonb) TO sandbox_exec;`
- **(b) Symmetry by removal:** add `REVOKE ALL ... FROM sandbox_exec` on all ten, stating the intent explicitly.

Recommendation: **(a)**, on the grounds that this release is a repair plus a PUBLIC/anon
tightening, and silently dropping an infrastructure role's access to one of ten functions is
a side effect nobody reviewed. Decision is yours; the migration is unmodified pending it.

---

## 3. Transaction semantics

| Question | Answer | Evidence |
|---|---|---|
| Does the migration contain explicit transaction control? | **No.** No `BEGIN`, `COMMIT`, `ROLLBACK`, `START TRANSACTION` or `SET LOCAL` at statement level. The eleven `BEGIN` tokens are all plpgsql block openers inside function bodies. | grep of the file |
| Is every statement transaction-safe? | **Yes.** The file contains only `CREATE OR REPLACE FUNCTION` (×10), `DROP FUNCTION IF EXISTS` (×3) and two `DO` blocks issuing `ALTER FUNCTION ... OWNER`, `REVOKE` and `GRANT`. All are transactional DDL in PostgreSQL. There is no `CREATE INDEX CONCURRENTLY`, `VACUUM`, `ALTER TYPE ... ADD VALUE` or `ALTER SYSTEM` — nothing that cannot run inside a transaction block. | statement inventory of the file |
| Does the Lovable executor wrap the whole file in one transaction? | **Unverified, and I cannot verify it non-destructively.** The executor is not introspectable from here, and proving it would require deliberately failing a real migration against LIVE. Supabase's migration runner conventionally wraps each file, but that is convention, not evidence, and this project already has documented executor behaviour that departs from convention (file renaming, DEF-020/023). | attempted and failed: the `sandbox_exec` role has no DDL rights (`permission denied for schema public`), so a `BEGIN … ROLLBACK` rehearsal is impossible |
| What happens if a statement fails after functions have been replaced? | **Two cases.** If the executor wraps: nothing persists, catalogue unchanged, safe retry. If it does not wrap: the file is left half-applied. The worst realistic partial state is the three `DROP FUNCTION` statements having run while a later statement failed — but the drops are positioned *after* all ten creates, so a failure at the drops leaves both canonical functions present and only the superseded overloads possibly gone, which is a *more* correct state, not a broken one. A failure *before* the drops leaves the old overloads intact and some bodies repaired — degraded but not worse than today. The genuinely bad state (canonical functions missing, old ones dropped) is not reachable from this statement order. | statement ordering in Parts 2–4 |

Mitigation available if you want certainty rather than argument: the file can be given an
explicit `BEGIN;` / `COMMIT;` wrapper so its atomicity does not depend on undocumented executor
behaviour. That is a checksum change and Claude's call; flagged, not made.

---

## 4. Behavioural verification — status and blocker

### 4.1 Non-production database: none available

There is **no** preview, staging, branch, or disposable restored database for this project.
Lovable Cloud exposes exactly one database, which is production. The Phase 0 §1 restore
rehearsal (approved in principle) has not been provisioned, and the `sandbox_exec` role
available here holds no DDL rights, so the migration cannot even be rehearsed inside an
aborted transaction.

**This is a deployment risk requiring an explicit human go/no-go.** It is not a deferral.

### 4.2 Fixture-free harness that DOES work — PostgREST resolution

Overload resolution *can* be tested without creating any persistent fixture, exactly as you
suggested: send each payload shape unauthenticated with a deliberately invalid all-zero UUID
and classify the response as *PostgREST-level* (PGRST203 / PGRST202) versus *function-level*
(42501 / 42883). A function-level error proves the request resolved to exactly one function
and entered it. No rows are written, because every one of these functions rejects a null
`auth.uid()` before any DML.

**Baseline captured against LIVE, pre-apply, 2026-07-31:**

| Probe | Payload | Result now | Class |
|---|---|---|---|
| A | service 14-key create | `42501 Not authenticated` (HTTP 401) | function-level — already unambiguous |
| B | OpsHealth 4-key create | `PGRST203` could not choose between the 13-arg date and 14-arg text creates (HTTP 300) | **PostgREST-level — broken** |
| C | service 9-key update | `PGRST202` no match; hint names the 8-arg text signature (HTTP 404) | **PostgREST-level — broken** |
| D | OpsHealth 2-key update | `PGRST203` could not choose between the two 8-arg updates (HTTP 300) | **PostgREST-level — broken** |
| E | `approve_bill_safe` | `42883 function public.set_rpc_context() does not exist` (HTTP 404) | function-level — DEF-001 outage confirmed live |

This is independent live reproduction of both defects, and it doubles as the post-apply gate.

**Required post-apply result for the same five probes:** every one must return a
*function-level* error. Because the migration revokes anon EXECUTE, the expected anon response
becomes `42501 permission denied for function ...` rather than `Not authenticated` — which
simultaneously proves (i) PostgREST resolved to exactly one candidate and (ii) the anon
revocation landed. Any remaining `PGRST203` or `PGRST202` is a failed release.

### 4.3 Checks that still cannot be run pre-production

These need the Phase 0 §4 Staff/Admin and second-tenant fixtures, which are approved but not
provisioned, plus at least one invoice (the tenant has none after the wipe):

| Required check | Can run pre-apply? | Blocker |
|---|---|---|
| All four payload shapes resolve to exactly one function | **Yes, post-apply, fixture-free** | none — probes B/C/D above |
| Portal create and update work | No | needs a portal user with `allow_invoice_create` and an owned entity |
| Member without `can_create_invoices` is rejected | No | needs a Staff fixture lacking the capability |
| Cross-tenant entity selection rejected | No | needs second tenant |
| Cross-tenant customer selection rejected on create and update | No | needs second tenant |
| Invalid replacement lines leave existing lines unchanged | No | needs a persisted draft with a line |
| `remaining_balance` correct | No | needs a persisted invoice and payment |
| Eight repaired functions no longer 42883 | Partially — probe E covers `approve_bill_safe` unauthenticated; the other seven can be probed the same way for *reachability*, but their success paths need bills, customers and rules | fixtures |
| ACL behaviour for authenticated / service_role / sandbox / anon | anon: **yes**, fixture-free. service_role: yes. authenticated: needs a session. sandbox_exec: yes, from this shell | partial |

### 4.4 Go / no-go framing

The honest position: this release can be verified **structurally** (catalogue shape, ACLs,
zero helper references, unique candidates) and **partially behaviourally** (resolution class,
anon rejection, 42883 clearance on reachability) without fixtures. The authorisation and
data-integrity behaviours cannot be proven before production apply, because no non-production
database exists to prove them on.

Two options:

- **Provision first:** stand up the Phase 0 §1 disposable clone and the §4 fixtures, run the
  full receipt there, then apply to production against a green rehearsal. Slower, and the only
  route that satisfies your stated bar.
- **Apply with the outage argument:** accept that eight production write paths are broken today
  (bill approval, voiding, supplier payments, customer creation, four automation-rule
  operations) and three invoice payload shapes are unusable, and that the structural plus
  fixture-free checks are the available evidence. Faster, but the capability tightening and the
  cross-tenant checks go to production unproven.

I am not choosing between these. Your call.

---

## 5. Rollback

`docs/releases/rollback/2026-07-31-def-001-002-rollback.sql` has been regenerated as a
**self-contained, executable artifact**. It is no longer a set of operator instructions.

Contents, all dumped from the LIVE catalogue pre-apply via `pg_get_functiondef()`:

- exact bodies of all twelve pre-migration signatures, verbatim, not retyped
- argument names, types, order and defaults exactly as LIVE holds them
- return types (`jsonb`), security mode (`SECURITY DEFINER`), volatility (`VOLATILE`) and
  function configuration (`SET search_path TO 'public'`) carried by `pg_get_functiondef` output
- owner restoration (`ALTER FUNCTION ... OWNER TO postgres`) for every signature
- exact pre-migration ACLs restored: EXECUTE to PUBLIC, anon, authenticated, service_role and
  sandbox_exec
- dependency-safe order: restore all twelve definitions, then drop the new 9-argument update,
  then restore ownership and ACLs
- an explicit `BEGIN; … COMMIT;` wrapper and two post-rollback assertions that abort the
  transaction if the catalogue is not back to its pre-migration shape (8 helper callers, 2+2
  invoice-draft overloads), so a partial rollback cannot be mistaken for success
- the outage warning retained in the header, alongside — not instead of — the executable SQL

It remains outside `supabase/migrations/` so it cannot be applied by accident.
