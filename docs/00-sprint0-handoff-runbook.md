# Filing Engine — Sprint 0 Handoff Runbook

This ties the three documents together and tells you the order of operations. Execution from here runs in **Claude Code against the AccountancyOS repo**, starting with reconnaissance. Nothing below pre-writes schema or code — that is deliberate; reconnaissance must run against the live repo first.

-----

## The documents, in order of use

1. **`architecture-validation-report.md`** — the *why*. Keep as an Architecture Decision Record (ADR). It records the two corrections (master-app credentials; spine-rooted, not HMRC-rooted) and the layered-spine model. Commit it to the repo under `docs/adr/`.
1. **`accountancyos-filing-engine-spec-v2.md`** — the *what*. The full target architecture. This is the reference Claude Code follows. Commit under `docs/`.
1. **`claude-code-sprint0-brief.md`** — the *do*. The execution instruction for Sprint 0 only. This is what you paste/point Claude Code at.

-----

## Claude Code kickoff sequence

Run in this order. Do not skip the gate at step 4.

1. **Update `CLAUDE.md`** — append the Non-Negotiable Architecture block from the Sprint 0 brief (the spine chain, “filings are deterministic projections of an immutable approved artefact rooted in the ledger”, and “the HMRC layer never owns figures of record”). This makes the principle resident in every Claude Code turn, not just the opening prompt.
1. **Start in plan mode.** Point Claude Code at `claude-code-sprint0-brief.md` and `accountancyos-filing-engine-spec-v2.md`. Instruct: “Reconnaissance only. Produce the deliverable report. Write no code, run no migrations, create no tables.”
1. **Let it inspect the live schema via the Supabase MCP.** Reconnaissance should read the *actual* database (tables, RLS helpers, existing audit/event systems, existing approval/versioning concepts) through the connected Supabase MCP server — not infer from code alone. This is how the parallel-approval-artefact risk gets caught: it has to *find* whatever approval concept already exists.
1. **GATE — review the reconnaissance report before any code.** This is the decision point. Specifically check the answer to the Critical Question:
- Does an approval / immutability / versioning artefact already exist in core? If yes → Claude Code must propose adapting it, **not** build a new one. Approve that approach before it proceeds.
- Does `approved-model-reader` have a stable interface to read from? If not, building that read interface (core-owned) is the genuine first task and may expand Sprint 0.
- Bring the report back here if you want a second set of eyes — this is where the silo risk lives.
1. **Approve, then let it implement Sprint 0 only.** Hold it to the Definition of Done: a Hello World call with proxy-attached fraud headers, fully audited (token redacted), plus tests proving no projection/submission can exist without an immutable approved-model reference and that approved snapshots can’t be mutated.
1. **Stop at Sprint 0.** Do not let it advance to quarterly submissions, obligations, BSAS, calculations, SA100 or final declaration.

-----

## HMRC sandbox prerequisite checklist (do in parallel — gates the live-OAuth step)

This is manual, on the HMRC Developer Hub, and independent of the repo. It unblocks the live OAuth round-trip that Sprint 0 mock-tests but cannot complete without real sandbox credentials. Verify exact wording/subscription names on the hub at the time — HMRC changes these.

1. **Register a Developer Hub account** — <https://developer.service.hmrc.gov.uk>
1. **Create a sandbox application** → capture sandbox `client_id` and `client_secret`. Store as Vault references (`hmrc.sandbox.client_id`, `hmrc.sandbox.client_secret`), never in code.
1. **Subscribe the application to the APIs** needed for Sprint 0 and the near sprints: at minimum **Hello World** and **Create Test User**; then the MTD IT set (Self Assessment Individual Details, Business Details, Obligations, Self-Employment Business, Property Business, Individual Calculations, etc.). Subscriptions are per-API.
1. **Set the redirect URI** on the application to match the OAuth callback your Sprint 0 build exposes (`hmrc.sandbox.redirect_uri`).
1. **Create sandbox test users** (Create Test User API or the hub’s test-user page):
- an **individual** with NINO / UTR and MTD-IT enrolment
- an **agent** with an Agent Services Account / ARN (for the agent-authorisation flows in Sprint 1)
1. **Record everything** in a secure note for the team — these are the credentials the live-OAuth gated step needs.

Production credentials are a later, separate step gated on HMRC’s approval process (Sprint 7) — do not request them now.

-----

## What I am deliberately *not* producing yet, and why

- **No migration files / DDL.** Writing them now would pre-empt reconnaissance and reintroduce the build-before-looking risk the brief exists to prevent. The schema in spec v2 is the *target shape*; the actual migrations must be reconciled against what reconnaissance finds (especially the core approval artefact and existing RLS helpers).
- **No edge function code.** Same reason — it depends on the existing shared framework that reconnaissance will document.

The next genuinely valuable thing I can do is **review the reconnaissance report** when it comes back — that is the real fork in the road, and where the parallel-approval and core-readiness risks either get caught or slip through.

-----

## One-line status

Architecture validated → v2 spec re-rooted → Sprint 0 brief hardened → **handoff to Claude Code (reconnaissance first).** HMRC sandbox setup can start in parallel.
