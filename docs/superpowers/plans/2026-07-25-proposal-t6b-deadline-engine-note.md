# Task 6b — deadline generation for per-period jobs: design note

**Decision needed before implementing T6b (MTD split + CT600 prerequisite + deadlines).**

## The situation (from Phase 0 discovery)
Two deadline engines coexist:
- **System A — `calculate_deadline`** (always-on, via `lifecycle_upsert_job_with_deadlines`). Produces correct **dated** deadlines for all core services today: company_accounts (+9m), confirmation_statement (+12m), corporation_tax (filing +12m **and** payment +9m+1d), sa_mtd/sa_non_mtd (31 Jan), vat_return (+1m+7d), payroll. **What it lacks:** per-quarter MTD deadlines and MTD-final.
- **System B — `lifecycle_generate_deadlines_for_job` + `canonical_deadline_rules`** (flag-gated, richer: models MTD q1–q4, CT payment, etc.). **But it is dormant for engine-created jobs** (they never set `canonical_service_code`/`job_template_code`), and when it does fire its trigger only supplies period-derived facts — so VAT/SA/accounts rules fall to "missing data" placeholders (they need `vat_scheme`/`tax_year`/`year_end` facts nobody supplies). Naively activating it would **regress** working deadlines.

## Key insight
The proposal now creates **one job per period** (per SA year, per accounts period, per VAT period, and — for MTD — per quarter + annual + SA). Once a job carries its own exact period, its deadline is **simple period-math on that one period** — it no longer needs System B's complex "4 quarters computed from a tax year" rule or the missing facts. e.g. an MTD-quarter job's deadline = its `period_end + 1 month`; MTD-final = 31 Jan.

## Options
**A. Extend the working System A** for the two new per-period job types (MTD quarter, MTD final); leave everything else as-is.
- Pros: lowest risk (System A already dated-correct for the rest); no fact-supply problem; smallest coherent change; delivers the spec's "separate deadline-bearing jobs" immediately.
- Cons: doesn't unify the engines; the per-quarter deadline logic lives in System A while System B's `canonical_deadline_rules` also (dormantly) describe MTD quarters — a soft duplication of *description* (not of live behaviour, since B is inert).

**B. Activate/unify onto System B** (bridge jobs in + fix the trigger fact-builder + fill the evaluator calc-shape gaps + retire System A).
- Pros: single data-driven engine; the long-term "right" architecture.
- Cons: large, high-risk; must fix fact-supply for every service and re-verify all deadlines; real chance of regressing currently-correct dates. Out of proportion to this release ("smallest coherent set of changes").

## Recommendation
**Option A for this release**, explicitly deferring full System-B unification to a dedicated engine-consolidation effort (it's the long-standing two-engine debt tracked separately). Rationale: because we've decomposed into per-period jobs, System A gives correct dated deadlines for *every* service with only two tiny additions, and it touches nothing that currently works. Activating System B now would be a large, deadline-risking rewrite the spec's "smallest coherent change" principle argues against.

## What T6b then does (pending your nod)
1. **Proposal MTD decomposition (UI + line-builder):** an MTD tax-year selection emits, for that year: per-quarter `mtd_quarter` lines (4), one `mtd_itsa_final` line, and (if selected) one `sa_non_mtd`/`sa_mtd` SA-return line — each period-carrying → separate jobs.
2. **`calculate_deadline` extension (migration):** add `mtd_quarter` (period_end + 1 month → 7 Aug/Nov/Feb/May) and `mtd_itsa_final` (31 Jan) cases. Nothing else changes.
3. **CT600 prerequisite (materialize):** when materialising a `corporation_tax` job for a company+year that also has a `company_accounts` job, set `jobs.prerequisite_job_id` to that Accounts job (reuse the column added in T6a). CT600 job stays one-per-accounts-year; multiple submissions live under it via `filing_submissions` (existing).

## One decision for you
**MTD-quarter service code.** Options: (a) reuse `sa_mtd` with per-quarter periods (4 `sa_mtd` jobs), or (b) a dedicated `mtd_quarter` catalog code (clearer; the spec calls "MTD quarterly filing" a distinct service type; there's an orphaned `mtd_quarterly` row we could revive/rename).
**Recommend (b)** — a dedicated code keeps "MTD quarterly filing" a first-class, separately-priceable/automatable service per the spec, and avoids overloading `sa_mtd`.
