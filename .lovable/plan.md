## Adopted programme

I am adopting your programme as written. Phases, evidence standard, hard gates, severity model, scoring and deliverables are taken verbatim as the specification for this run. The plan below records how it will be executed and, importantly, where this environment cannot satisfy it.

## Environment limits you must decide on before Phase 1

These are structural, not effort-related. Each needs a ruling from you, because under your own rules an unverifiable gate cannot be scored as passing.

**Gate 7 — rehearsed backup restore.** Lovable Cloud gives no restore-into-a-safe-environment capability from here. I can evidence that backups exist and record the recovery point, but I cannot rehearse recovery. Under your gate list that is INSUFFICIENT EVIDENCE, not PASS. Options: accept it as a recorded residual risk with a named owner, or treat it as blocking and arrange restore rehearsal outside Lovable.

**Gate 9 / Phase 6 — monitoring and alerting.** There is no alerting infrastructure in this project. I can prove the *detection signal exists* (logs, queue state, `email_send_log`, automation execution rows are all queryable) but there is no threshold, destination, owner, runbook or tested alert delivery. I expect Phase 6 to come back largely NOT IMPLEMENTED. That is a finding, not a test failure, and it will materially cap the launch cohort.

**Second tenant for isolation testing.** Blue Tick alone cannot prove isolation. I need to create a second practice tenant with its own owner identity and a small record set. Confirm I may create it, and whether it should be destroyed at cleanup or retained as a permanent QA tenant. Retaining it is the better long-term answer.

**Owner / Staff / Admin identities.** You have Owner. Staff and Admin fixtures need creating in Blue Tick to test the permission matrix at all. Confirm.

**Multi-practice identity.** Testable only if the product claims to support it. My reading of the schema (`organization_users`, `portal_access`) is that a portal identity is single-practice, but this is one of your unresolved decisions — it will sit as PRODUCT DECISION REQUIRED until you rule.

**Production-sized performance data.** Blue Tick was wiped and is near-empty. Real p50/p95 numbers need seeded volume — several thousand transactions, hundreds of clients. I can seed synthetic `E2E-` volume, which is realistic for query planning but not for real-world data shapes. Without it, Phase 5 performance is informational only, as your own rule states.

**Reliability injection.** Network loss, storage failure, worker restart and provider outage cannot be induced against managed infrastructure. I can test what is inducible — duplicate invocation, duplicate webhook, timeout behaviour, database rejection, concurrent writes, stale state — and will register the rest as UNTESTABLE with reasoning rather than quietly omitting them.

**Sandbox-gated externals.** HMRC and Companies House filing paths are sandbox-pinned; Stripe is not in live mode. Submission correctness is therefore assessable only to the boundary of our own payload construction. That boundary will be stated precisely.

## Phase 0 is the real dependency

Phase 0 is not a formality here and it cannot be completed by me alone. The ten open product decisions you listed are genuine forks — direct client creation, Quotes as a surface, the Qualified stage, questionnaire period allocation, re-signature triggers, contact signing rights, job rollover, workpaper locking, billing ownership. Every one of them determines whether observed behaviour is correct or defective.

My approach: I build the requirements matrix from the codebase, migrations, memory and docs, and for each open decision I present the behaviour the system *actually implements today*, with evidence. You then either ratify the implemented behaviour as the requirement, or declare it wrong. Ratifying is usually fast; it is far quicker to react to "here is what it does" than to specify from scratch.

Anything you do not rule on is recorded as PRODUCT DECISION REQUIRED with its launch impact, and cannot be scored PASS.

## Execution shape

Phase 0 (requirements freeze, decisions surfaced) → Phase 1 (preflight, hard stop on failure) → Phase 2 (catastrophic-risk: identity, tenant isolation, data integrity — anything failing here halts normal testing and escalates immediately) → Phase 3 (the continuous commercial journey) → Phase 4 (module coverage) → Phase 5 (non-functional) → Phase 6 (operational) → Phase 7 (security and deployment integrity) → Phase 8 (cleanup verification).

Every case carries a stable ID and the full evidence set you specified: UI result via Playwright with trace and screenshot, HTTP status and body, console output, SQL verification against the system of record, storage verification, edge-function log, audit-event verification, cleanup status. PASS requires the user-visible result and every applicable system-of-record result to agree. No production-code changes during discovery; defects are recorded, then fixed and retested only after your approval.

All artefacts land under `docs/audits/2026-07-27-launch-readiness-e2e/`, with the principal report at `docs/audits/2026-07-27-launch-readiness-e2e.md`. A machine-readable creation ledger records every row ID, storage path, auth identity, queued message and external reference from the first write, so cleanup is provable rather than best-effort.

Checkpoint after each phase. Immediate interruption for any P0/P1, isolation failure, financial or statutory incorrectness, or cleanup touching pre-existing records.

## Honest expectation

Based on what this project's history already shows — orphaned auth identities, PostgREST conflict-inference failures, migration drift between Git and live, sandbox-pinned filing, no alerting layer — I do not expect a GO verdict. My working expectation is CONDITIONAL GO at "Blue Tick internal use" or "one supervised pilot client", with recovery rehearsal and monitoring as the two structural gaps. I would rather set that expectation now than deliver a reassuring number that conceals a failed gate.

On sign-off: you cannot credibly hold all four approval roles yourself. I will record the governance limitation explicitly in the sign-off block as your programme requires.

## What I need to start

1. Rulings on the six environment limits above (second tenant, Staff/Admin fixtures, restore rehearsal, monitoring scope, performance seeding, multi-practice claim).
2. Agreement to the Phase 0 method — I present implemented behaviour, you ratify or reject.

Give me those and I begin Phase 0 immediately.
