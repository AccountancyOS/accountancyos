## Where the audit stands

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements freeze | BLOCKED — six owner rulings outstanding |
| 1 | Preflight | COMPLETE — DEF-001..005, DEF-023/024/025 |
| 2 | Catastrophic risk | COMPLETE — RLS + immutability PASS; DEF-015, DEF-016 |
| 3 | Commercial journey | COMPLETE — only DEF-003 fails |
| 4 | Module coverage | LARGELY COMPLETE — DEF-006/007/008/012/013/014 |
| 5 | Non-functional | COMPLETE (informational) — DEF-017 |
| 6 | Operational | COMPLETE — DEF-018/019/020 |
| 7 | Security & deployment integrity | COMPLETE — DEF-015/021/022 |
| 8 | Cleanup verification | NOT STARTED |

No production code or schema changes in this run. Discovery only; defects recorded, fixed later on your approval via git-authored migrations.

## Next run

Only Phase 0 (blocked on six owner rulings) and Phase 8 (cleanup, deferred pending
your go-ahead) remain. Everything below is the record of the completed runs.

**Phase 5 — Non-functional readiness (informational, per your own rule)**
- Query-plan and latency profile on the heaviest read paths: Overview dashboard aggregates, clients list, jobs board, deadlines calendar, trial balance and general ledger RPCs. Capture p50/p95 from repeated live calls plus `EXPLAIN` shapes.
- Slow-query and index review against live statistics; flag sequential scans on tenant-scoped tables and missing indexes on `organization_id` / foreign keys.
- Payload-size and N+1 review on the routes that fired the most requests during the Phase 4 sweep.
- Accessibility and responsive spot-check on the five highest-traffic accountant screens and the portal dashboard.
- Recorded as informational because Blue Tick holds near-zero volume; real p95 needs seeding, which is one of your outstanding rulings.

**Phase 6 — Operational readiness**
- Enumerate what detection signal actually exists: edge-function logs, `email_send_log`, `email_queue` states, automation execution rows, audit tables.
- Enumerate scheduled jobs actually present in production versus those the product assumes exist (already known: no `process-email-queue` schedule).
- Backup existence and recovery point evidence; restore rehearsal remains unavailable and will be recorded as INSUFFICIENT EVIDENCE, not PASS.
- Alerting: thresholds, destinations, owners, runbooks. Expected to come back NOT IMPLEMENTED, which caps the launch cohort.
- Release-integrity check: compare live edge-function version probes and `schema_migrations` against the git baseline; report drift.

**Phase 7 completion**
- Storage bucket policies and public-object exposure.
- Auth configuration: password policy, email confirmation, session lifetime, redirect allow-list, provider settings.
- Secret handling in edge functions: any secret reaching a log, response body or client.
- Full `anon`-executable RPC enumeration with an authorisation-check verdict per function, so DEF-015 has a definitive remediation list rather than a sample.

**Phase 8 — deferred**
Cleanup stays deferred until you confirm, since the ledger records are what keep DEF-003 and DEF-011 reproducible.

## Output

`docs/audits/2026-07-27-launch-readiness-e2e.md` updated: stale Phase 2 row corrected, Phase 5/6/7 sections appended, defect register extended with any new IDs, phase table and verdict refreshed. Checkpoint back to you at the end, with immediate interruption for any new P0/P1.
