# Platform Escalation — DEF-031: `sandbox_exec` BYPASSRLS restored out of band

**Status:** OPEN — recurring drift. Not closed, not verified.
**Raised:** 2026-08-06
**Severity:** High. Structural tenant-isolation bypass on a login role in production.
**Production project ref:** `moxpdejnucjjcplleefn`
**Raw evidence:** `docs/audits/raw/2026-08-06-def-031-recurrence.txt`
**Repair migration of record:** `supabase/migrations/20260805200000_def_031_sandbox_exec_nobypassrls.sql`

---

## 1. Summary

The managed login role `sandbox_exec` (**OID 161547**) in production project
`moxpdejnucjjcplleefn` carries `rolbypassrls = true`. RLS is the sole mechanism enforcing
the tenant boundary in this application, so any session opened as this role defeats tenancy
wholesale for every table.

We have removed the attribute three times. It has been restored out of band each time by an
actor outside our control and outside our Git repository. **The role's OID has been `161547`
at every observation — before and after every recurrence — so the role is being ALTERed in
place, not dropped and recreated.**

## 2. Timeline — exact before/after attributes

| # | Timestamp (UTC) | OID | rolsuper | rolbypassrls | rolcanlogin | Event |
|---|---|---|---|---|---|---|
| 1 | 2026-08-05 (discovery) | 161547 | f | **t** | t | Found during DEF-004 role audit |
| 2 | 2026-08-05 (post-apply) | 161547 | f | f | t | `20260805200000` applied; verified from a NEW connection |
| 3 | 2026-08-06 ~11:4x (pre-alter) | 161547 | f | **t** | t | Reverted out of band |
| 4 | 2026-08-06 ~11:4x (post-alter) | 161547 | f | f | t | Re-applied; verified from a NEW connection; `SELECT count(*) FROM organizations` → 0 (RLS active) |
| 5 | **2026-08-06 12:23:21.791673+00** | **161547** | f | **t** | t | **Reverted again, < 4 hours after a verified-clean state** |

Role memberships at every observation: **none** (zero rows in `pg_auth_members` for
`member = sandbox_exec`). The bypass is a direct role attribute, not inherited.

## 3. The role is altered in place, not recreated

OID `161547` is constant across all five observations above. A drop/recreate cycle would
allocate a new OID. The reverting actor therefore issues `ALTER ROLE sandbox_exec BYPASSRLS`
(or an equivalent reprovisioning statement) against the existing role.

## 4. No Git-controlled source exists

`rg` across `supabase/`, `scripts/`, `src/` and `.github/` for `CREATE ROLE`, `ALTER ROLE`,
`BYPASSRLS` and `CREATEROLE` returns only:

- the DEF-031 repair migrations (`20260805200000`, and the executor-applied copies
  `20260805210851`, `20260806114404`),
- their regression test (`src/test/regression/def-031-sandbox-exec-nobypassrls.test.ts`),
- the fail-closed pre-check (`scripts/precheck-rls-boundary.ts`),
- DEF-019's `GRANT EXECUTE ... TO sandbox_exec` follow-up, which grants no role attributes.

There is **no** provisioning script, seed, edge function, cron job or CI workflow in this
repository that creates or alters `sandbox_exec`. The reprovisioning source is Lovable Cloud
platform automation, outside Git and outside this project's control. It cannot be removed
from here.

## 5. We cannot repair it from the executor session either

From a `sandbox_exec` psql session on 2026-08-06:

```
ALTER ROLE sandbox_exec NOBYPASSRLS;
ERROR:  permission denied to alter role
DETAIL:  Only roles with the CREATEROLE attribute and the ADMIN option on role "sandbox_exec" may alter this role.
```

Repair is only possible through the Lovable Cloud migration executor. The actor restoring the
attribute holds privileges that we do not.

## 6. Containment now in place

`scripts/precheck-rls-boundary.ts` is a fail-closed pre-check that reads `pg_roles` for
`current_user` and aborts unless **that same session** confirms `rolbypassrls = false`,
`rolsuper = false` and zero bypassing/superuser parent roles. Any error, missing row or
unreadable catalog aborts — absence of a negative is never read as a pass.

`scripts/verify-post-publish.ts` calls it before reading anything and exits 3 on failure.
No `sandbox_exec` observation may be recorded as RLS evidence unless that pre-check passed in
the same session. Durable cross-tenant evidence is produced instead by `scripts/smoke-test.ts`
using real authenticated fixture users.

This is containment and detection only. It does not prevent the bypass window between a
reversion and its next detection.

## 7. Requests to the platform team

1. **Identify and disable the Lovable Cloud automation that restores `BYPASSRLS` on
   `sandbox_exec` in project `moxpdejnucjjcplleefn`.** Repeated manual `ALTER ROLE` is not an
   acceptable permanent fix; each recurrence reopens an unbounded tenant-isolation bypass.
2. **Confirm whether any other managed login roles in this project (or across Lovable Cloud
   projects generally) receive the same attribute.** If `BYPASSRLS` is applied by default to a
   class of managed roles, we need the full list of affected roles for this project.
3. **Provide an audit trail of every alteration to `sandbox_exec`** — timestamps, the actor or
   automation that issued each statement, and the exact statements — covering at minimum
   2026-08-05 to date, so we can bound the exposure window and confirm when the behaviour began.

## 8. Post-fix remediation we will require

Once the platform-side cause is removed and confirmed, **rotate the `sandbox_exec`
credentials**. The role has held `rolcanlogin = true` combined with unrestricted tenant bypass
for an unknown period; the credential must be treated as exposed relative to that privilege
level, independently of whether any misuse is evidenced.

## 9. Closure criteria

DEF-031 stays **open — recurring drift** until all of the following hold:

- the reprovisioning source is identified and disabled by the platform team;
- `rolbypassrls = false` on OID 161547 is observed to persist across at least one full
  deployment cycle with no manual intervention;
- the audit trail in §7.3 is supplied;
- `sandbox_exec` credentials are rotated.

Manual re-application of `ALTER ROLE sandbox_exec NOBYPASSRLS` does not satisfy closure and
must continue to be logged as a recurrence, not a fix.
