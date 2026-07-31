# DEF-001 + DEF-002 — Pre-Apply Verification (amended)

Status: **NOT APPLIED. LIVE apply is held.** Nothing in this document changed LIVE. All
observations are read-only catalogue queries and unauthenticated API probes.

| Artifact | Path | sha256 |
|---|---|---|
| Forward migration (amended) | `supabase/migrations/20260731210000_def_001_002_rpc_context_and_invoice_draft.sql` | `0d18496c878a350e9a1e6d544df7b1dc7ce37737f0c86f4185150c989fe9ead6` |
| Forward migration (as authored at `5c76747`) | same | `aee9c160b5594b2748db7434c8397d22fd7e13100803204e1d04ba6cdf4830f5` (superseded) |
| Rollback (`0993679`) | `docs/releases/rollback/2026-07-31-def-001-002-rollback.sql` | `f9113d5ca10546802732d1cc93e2b14f5daa9d7ce4c86051e7cfa2388a53534e` |

---

## 1. Amendment — what changed since `5c76747`

Claude's commit `0993679` (self-contained executable rollback and its guards) is incorporated
as authored. Two owner-approved changes were then made to the forward migration, and nothing
else:

1. **Explicit transaction wrapper — operational, not functional.** A top-level `BEGIN;` at
   line 56, before the first `CREATE OR REPLACE FUNCTION`, and `COMMIT;` at line 741, after
   the final `GRANT`. No statement added, removed, reordered or altered.
2. **Explicit `sandbox_exec` grant — the only functional change.** Two `GRANT EXECUTE …
   TO sandbox_exec` statements after the Part 4 loop, covering both canonical invoice-draft
   signatures.

All eight repaired bodies, both canonical bodies, the three `DROP`s, and the Part 4 loop with
its ten signatures are byte-identical to `5c76747`. Comment text was extended to document
both changes.

---

## 2. Corrected verification language

"All ten affected signatures" is **not** the disproven audit claim of ten broken helper
callers. The ten are:

**Group A — eight repaired helper-calling signatures** (`PERFORM public.set_rpc_context()`
inlined to `PERFORM set_config('app.rpc','1',true)`):

1. `create_automation_rule_safe(uuid,text,text,jsonb,text,jsonb,boolean,text)`
2. `update_automation_rule_safe(uuid,text,text,jsonb,text,jsonb,boolean,text)`
3. `toggle_automation_rule_safe(uuid,boolean)`
4. `delete_automation_rule_safe(uuid)`
5. `approve_bill_safe(uuid)`
6. `void_bill_safe(uuid,text)`
7. `record_bill_payment_safe(uuid,numeric,date,uuid,text,text)`
8. `create_customer_safe(uuid,text,uuid,text,text,text,jsonb,text,text,integer,text,text)`

**Group B — two resulting canonical invoice-draft signatures** (neither ever called the
helper; this is the DEF-002 collision, not a DEF-001 failure):

9. `create_invoice_draft_safe(uuid,text,uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb)` — 14 args, replaced in place
10. `update_invoice_draft_safe(uuid,uuid,text,text,text,text,text,text,jsonb)` — 9 args, **newly created**

Eight repaired + two canonical = ten touched. The live count of helper callers was and remains
**eight**.

---

## 3. Signature and ACL matrix

### 3.1 Pre-migration (LIVE inventory, identical on all twelve signatures)

```
owner  = postgres
proacl = {=X/postgres, postgres=X/postgres, anon=X/postgres,
          authenticated=X/postgres, service_role=X/postgres, sandbox_exec=X/postgres}
```

### 3.2 Statements the amended migration executes

Part 4 loops over the ten signatures:

```sql
ALTER FUNCTION <sig> OWNER TO postgres;
REVOKE ALL ON FUNCTION <sig> FROM PUBLIC;
REVOKE ALL ON FUNCTION <sig> FROM anon;
GRANT EXECUTE ON FUNCTION <sig> TO authenticated, service_role;
```

then, explicitly, outside the loop:

```sql
GRANT EXECUTE ON FUNCTION public.create_invoice_draft_safe(
  uuid, text, uuid, text, uuid, text, text, text, text, text, text, text, text, jsonb
) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.update_invoice_draft_safe(
  uuid, uuid, text, text, text, text, text, text, jsonb
) TO sandbox_exec;
```

### 3.3 Intended final ACL — all ten

| # | Signature | PUBLIC | anon | authenticated | service_role | sandbox_exec | owner |
|---|---|---|---|---|---|---|---|
| 1 | `create_automation_rule_safe(uuid,text,text,jsonb,text,jsonb,boolean,text)` | revoked | revoked | EXECUTE | EXECUTE | EXECUTE (preserved) | postgres |
| 2 | `update_automation_rule_safe(uuid,text,text,jsonb,text,jsonb,boolean,text)` | revoked | revoked | EXECUTE | EXECUTE | EXECUTE (preserved) | postgres |
| 3 | `toggle_automation_rule_safe(uuid,boolean)` | revoked | revoked | EXECUTE | EXECUTE | EXECUTE (preserved) | postgres |
| 4 | `delete_automation_rule_safe(uuid)` | revoked | revoked | EXECUTE | EXECUTE | EXECUTE (preserved) | postgres |
| 5 | `approve_bill_safe(uuid)` | revoked | revoked | EXECUTE | EXECUTE | EXECUTE (preserved) | postgres |
| 6 | `void_bill_safe(uuid,text)` | revoked | revoked | EXECUTE | EXECUTE | EXECUTE (preserved) | postgres |
| 7 | `record_bill_payment_safe(uuid,numeric,date,uuid,text,text)` | revoked | revoked | EXECUTE | EXECUTE | EXECUTE (preserved) | postgres |
| 8 | `create_customer_safe(uuid,text,uuid,text,text,text,jsonb,text,text,integer,text,text)` | revoked | revoked | EXECUTE | EXECUTE | EXECUTE (preserved) | postgres |
| 9 | **`create_invoice_draft_safe(…14 args, text dates)`** | revoked | revoked | EXECUTE | EXECUTE | **EXECUTE (explicit grant)** | postgres |
| 10 | **`update_invoice_draft_safe(…9 args)` — NEW** | revoked | revoked | EXECUTE | EXECUTE | **EXECUTE (explicit grant)** | postgres |

Rows 1–8 retain `sandbox_exec` implicitly: it is an independent grantee, so `REVOKE … FROM
PUBLIC` and `REVOKE … FROM anon` do not touch it, and `CREATE OR REPLACE FUNCTION` preserves
an existing function's ACL. Rows 9 and 10 no longer rely on that reasoning — the grant is
stated in the file. Row 10 needed it: as a **new** signature it has no historical ACL, so it
would have been created with implicit PUBLIC EXECUTE, had PUBLIC revoked, and ended with no
`sandbox_exec` grant — executor infrastructure able to create an invoice draft but not update
one. Row 9's grant is idempotent and included so the pair is symmetrical and provable from the
file rather than from history.

---

## 4. Transaction semantics

| Question | Answer |
|---|---|
| Does the migration contain explicit transaction control? | **Yes, now.** Exactly one top-level `BEGIN;` (line 56) and one `COMMIT;` (line 741). The other eleven `BEGIN` tokens are plpgsql block openers inside function bodies. |
| Is every statement transaction-safe? | **Yes.** Only `CREATE OR REPLACE FUNCTION` (×10), `DROP FUNCTION IF EXISTS` (×3), two `DO` blocks issuing `ALTER FUNCTION … OWNER` / `REVOKE` / `GRANT`, and two explicit `GRANT`s. No `CREATE INDEX CONCURRENTLY`, `VACUUM`, `ALTER TYPE … ADD VALUE` or `ALTER SYSTEM` — nothing forbidden inside a transaction block. Asserted by test. |
| Does the Lovable executor add a transaction automatically? | **Unverified, and unverifiable without deliberately failing a real migration against LIVE** — the executor is not introspectable, and a `BEGIN … ROLLBACK` rehearsal is impossible because `sandbox_exec` has no DDL rights (`permission denied for schema public`). **This no longer matters.** The file is atomic on its own; if the executor also wraps, the nested block is a no-op. |
| What happens if a statement fails after functions have been replaced? | **Nothing persists.** The explicit wrapper aborts the whole file, catalogue unchanged, safe to retry. Previously this depended on undocumented executor behaviour; it now does not. As a second line of defence the three `DROP`s remain positioned after all ten creates, so even a hypothetical unwrapped partial state cannot leave the canonical functions missing while the superseded overloads are gone. |

---

## 5. Behavioural verification — status and blocker

### 5.1 Non-production database: none available

There is **no** preview, staging, branch, or disposable restored database for this project.
Lovable Cloud exposes exactly one database, and it is production. The Phase 0 §1 restore
rehearsal is approved in principle but not provisioned, and the `sandbox_exec` role holds no
DDL rights, so the migration cannot be rehearsed even inside an aborted transaction.

**This is a deployment risk requiring an explicit human go/no-go.** It is not a deferral.

### 5.2 Fixture-free harness that DOES work — PostgREST overload resolution

Overload resolution is testable with no persistent fixture: send each payload shape
unauthenticated with all-zero UUIDs and classify the response as *PostgREST-level*
(`PGRST203` / `PGRST202`) versus *function-level* (`42501` / `42883`). A function-level error
proves the request resolved to exactly one candidate and entered the function. No rows are
written — every one of these functions rejects a null `auth.uid()` before any DML.

**Baseline captured against LIVE, pre-apply, 2026-07-31:**

| Probe | Payload | Result now | Class |
|---|---|---|---|
| A | service 14-key create | `42501 Not authenticated` (HTTP 401) | function-level — already unambiguous |
| B | OpsHealth 4-key create | `PGRST203` between the 13-arg date and 14-arg text creates (HTTP 300) | **PostgREST-level — broken** |
| C | service 9-key update | `PGRST202` no match; hint names the 8-arg text signature (HTTP 404) | **PostgREST-level — broken** |
| D | OpsHealth 2-key update | `PGRST203` between the two 8-arg updates (HTTP 300) | **PostgREST-level — broken** |
| E | `approve_bill_safe` | `42883 function public.set_rpc_context() does not exist` (HTTP 404) | function-level — DEF-001 outage confirmed live |

Independent live reproduction of both defects, and the post-apply gate.

**Required post-apply result:** all five probes must return a *function-level* error. Because
anon EXECUTE is revoked, the expected anon response becomes `42501 permission denied for
function …` rather than `Not authenticated` — which simultaneously proves single-candidate
resolution and the anon revocation. Any remaining `PGRST203` or `PGRST202` is a failed release.

### 5.3 Checks that still cannot be run pre-production

| Required check | Runnable pre-apply? | Blocker |
|---|---|---|
| All four payload shapes resolve to exactly one function | **Yes — post-apply, fixture-free** (probes B/C/D) | none |
| Portal create and update work | No | needs a portal user with `allow_invoice_create` and an owned entity |
| Member without `can_create_invoices` rejected | No | needs a Staff fixture lacking the capability |
| Cross-tenant entity rejected on create | No | needs second tenant |
| Cross-tenant customer rejected on create and update | No | needs second tenant |
| Invalid replacement lines leave existing lines unchanged | No | needs a persisted draft with a line |
| `remaining_balance` correct | No | needs a persisted invoice and payment |
| Eight repaired functions no longer 42883 | Reachability yes (probe E pattern); success paths no | needs bills, customers, rules |
| ACL behaviour: anon and service_role | **Yes, fixture-free** | none |
| ACL behaviour: authenticated | No | needs a session |
| ACL behaviour: sandbox_exec | **Yes, from the executor shell** — and now covers the amended grant on the 9-arg update | none |

Blocker: Phase 0 §4 Staff/Admin and second-tenant fixtures are approved but not provisioned,
and the tenant holds no invoices after the data wipe.

### 5.4 Go / no-go framing

Verifiable now: catalogue shape, ACLs, zero helper references, single candidates, anon
rejection, 42883 clearance on reachability, atomicity. Not verifiable before production apply:
the authorisation and data-integrity behaviours, because no non-production database exists.

- **Provision first:** stand up the Phase 0 §1 clone and §4 fixtures, run the receipt there,
  then apply against a green rehearsal. Slower; the only route that meets the stated bar.
- **Apply on the outage argument:** accept that eight production write paths are broken today
  and three invoice payload shapes are unusable, and that structural plus fixture-free checks
  are the available evidence.

Not chosen by the executor. Owner decision.

---

## 6. Rollback

Incorporated from `0993679`, unmodified. Self-contained and executable: twelve verbatim
pre-migration definitions, the new 9-argument update dropped by complete signature *after* the
restores, owner and exact pre-migration ACLs (PUBLIC, anon, authenticated, service_role,
sandbox_exec) restored, all inside one `BEGIN;` / `COMMIT;`. Kept outside
`supabase/migrations/` so it cannot be applied by accident.

Guards, all passing in `src/test/regression/def-001-002-rpc-context.test.ts`: twelve
`CREATE OR REPLACE` blocks, eight restored `set_rpc_context` callers, `DROP` of the 9-argument
update by complete signature, recreate-before-drop ordering, a single `BEGIN`/`COMMIT`, no
`OPERATOR STEP` text, the `SELF-CONTAINED AND EXECUTABLE` header, and the file absent from
`supabase/migrations/`.

One observation, flagged not changed: the rollback's post-rollback verification is a block of
comment-form operator queries (expect 8 helper callers, 4 invoice-draft overloads, ACLs
carrying `=X` and anon), not in-transaction assertions that would abort a partial rollback.
The rollback is incorporated as authored.
