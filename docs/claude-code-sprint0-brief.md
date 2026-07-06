# Claude Code Instruction — Implement Filing Engine v2, Sprint 0 Only

You are implementing the AccountancyOS Filing Engine v2. This supersedes the previous HMRC-rooted draft.

**Do not implement from memory. Do not infer architecture. Follow the attached v2 specification exactly.**

-----

## Non-Negotiable Architecture

The filing engine must be downstream of the AccountancyOS accounting spine:

```
Ledger → Adjustments → Normalised Financial Model → Workpapers → Review → Approval
→ Approved Financial Model Version → Filing Projection → HMRC Submission
```

HMRC filings are **deterministic projections of an immutable approved artefact rooted in the ledger.**

The HMRC layer is only: transport, obligations, OAuth, fraud prevention, audit, submission state, and HMRC responses. **It must never own figures of record.**

-----

## First Task — Reconnaissance Only (no code, no migrations)

Inspect the existing repo and produce a report covering:

1. Existing ledger tables
1. Existing adjustment tables
1. Existing financial model / workpaper tables
1. Existing job / service / engagement tables
1. Existing filing / submission / HMRC tables
1. Existing Supabase RLS helper functions
1. Existing edge function framework
1. Existing Vault / secrets usage
1. Existing audit / event systems
1. Existing test setup

**Do not create new tables until you know what already exists.**

### Critical Question — the approval artefact (read carefully)

Confirm whether `approved_financial_model_versions` **or any equivalent immutable approval / versioning / sign-off artefact** already exists in core — under any name.

- **If any such concept exists:** do **NOT** create a new approval table. Propose how to adapt, extend, or read from the existing one, and **stop for sign-off** before proceeding. Creating a second approval artefact is the single worst outcome — it produces parallel sources of truth.
- **If, and only if, nothing equivalent exists:** flag this as a **core readiness gap.** The approval artefact must then be built as a **core-owned migration** (namespaced and owned by the accounting core, not by the filing engine). The filing engine sits *downstream* of this artefact and must never own it.
- **Never** work around its absence by storing income, expense, adjustment or tax figures inside HMRC filing tables.

-----

## Sprint 0 Scope Only

Implement only the foundation layer:

1. Shared edge function framework alignment (reuse existing; do not fork)
1. HMRC master-app credential model
1. Vault secret references
1. OAuth start / callback / refresh using the practice ASA (build + mock-test; see live-OAuth dependency below)
1. Fraud-prevention header collector (browser) and server-side merger
1. HMRC call proxy (the sole egress to HMRC)
1. HMRC audit table (with token redaction — see Security)
1. Submission state-machine foundation (enforcement + DB trigger)
1. `approved_financial_model_versions` **only if absent**, and **only as a core-owned migration** per the Critical Question
1. Projection-gate constraints
1. `approved-model-reader`
1. Hello World sandbox call (the **only** HMRC endpoint wired in Sprint 0)
1. Tests proving approval-gate enforcement

**Do not implement** quarterly submissions, SA100, BSAS, calculations, obligations, business-details sync, or final declaration yet. Do not wire any HMRC endpoint other than Hello World — the proxy is exercised via Hello World plus mocks.

-----

## Database Rules

All schema must enforce the architecture at the database level. Required constraints:

- No `filing_projection` without `approved_model_version_id` (`NOT NULL`, `ON DELETE RESTRICT`)
- No `submission` without `filing_projection_id` (`NOT NULL`, `ON DELETE RESTRICT`)
- Approved model snapshots **immutable after insert** (trigger rejects UPDATE to snapshot / hash; supersession is a new row)
- Projection `source_hash` must equal the approved model snapshot hash at insert (trigger-enforced)
- Submission state transitions enforced by trigger (reject illegal transitions)
- RLS on every filing-engine table
- Tenant isolation enforced by the DB, not the frontend

### Migration safety

- **Do not alter any existing core table** during Sprint 0. Any proposed change to a core table is a **flagged proposal requiring approval**, never a silent migration.
- All migrations must be reversible, transactional, and non-destructive to existing data.

-----

## Security Requirements

Every edge function must:

1. Authenticate the user
1. Resolve tenant / practice **from verified JWT claims** (never from any request body)
1. Validate tenant membership
1. Validate record ownership
1. Reject cross-tenant access
1. Never trust client-supplied `tenant_id`, `client_id`, `job_id`, `submission_id` or `projection_id`

Additional:

- **No HMRC call may be made outside the central HMRC call proxy.**
- **Reuse core’s RLS / tenant-resolution helper functions.** Do not author parallel ones.
- **Secret & token hygiene:** no secret value may appear in migrations, code, logs, or the audit table. The audit record **must redact** `Authorization` (bearer tokens) and any credential before persistence; store a hash only if correlation is needed.
- Fraud-prevention headers contain PII (IPs, device ID, user agent). In Sprint 0 use **sandbox test data only**; flag that the 7-year audit retention of these fields is covered by the DPIA before any production use.

-----

## Master-App Model

Build for:

- one AccountancyOS HMRC software app **per environment** (sandbox + production), held centrally — `hmrc_apps` is global, not tenant-scoped
- practice-level ASA OAuth authorisation (each practice signs in with its **own** ARN)
- encrypted per-practice tokens (`pgsodium`)
- AccountancyOS-owned fraud-prevention **vendor** headers

Do **not** build per-practice HMRC software applications. You may leave an extension seam for future enterprise tenant-owned credentials, but **do not implement it.**

### Live-OAuth dependency

A live ASA OAuth round-trip requires a provisioned sandbox application plus a test agent and an MTD-IT-enrolled test user. In Sprint 0: **build and mock-test** OAuth start/callback/refresh. The **live** round-trip is a **separate gated step** contingent on sandbox credentials and test users being provisioned. Do not fake or stub a successful live OAuth response to make a test pass.

-----

## Tests Required in Sprint 0

Add tests proving:

1. A submission cannot exist without an approved model version (attempt the insert; assert the DB rejects it).
1. A projection cannot exist without an approved model version.
1. Approved model snapshots cannot be edited after insert.
1. Source-hash mismatch between projection and approved snapshot is rejected.
1. Cross-tenant access is rejected (read and write).
1. No HMRC call reaches HMRC except via the proxy.
1. **The proxy attaches the full fraud-prevention header set to the outbound request** (assert on the request the proxy builds — do not rely on HMRC rejecting their absence).
1. The audit record contains **no** raw bearer token or secret.
1. State-machine invalid transitions are rejected.
1. The Hello World sandbox call is audited end-to-end.
1. OAuth token refresh preserves tenant isolation.

-----

## Deliverable (before implementation)

Provide:

1. Reconnaissance report
1. Existing architecture findings
1. Tables / functions to reuse
1. Tables / functions to create
1. Migration plan (reversible, non-destructive, no core-table edits without sign-off)
1. RLS plan (reusing core helpers; tenant from JWT)
1. Edge function plan
1. Test plan
1. Risks
1. Confirmation that no parallel filing model and no parallel approval artefact will be created
1. Core-dependency confirmation: does the approval artefact exist, and does it expose a stable read interface for `approved-model-reader`? If not, the core-owned migration to create it is the first Sprint 0 item.

Then implement Sprint 0 **only.**

-----

## Definition of Done (Sprint 0)

Both must hold:

- A Hello World call succeeds with the full fraud-prevention header set attached by the proxy, and is fully audited (with the bearer token redacted).
- A test proves that **no projection and no submission can exist without an immutable approved-model-version reference**, and that approved snapshots cannot be mutated.

-----

## Hard Rules

- No placeholders.
- No duplicate systems. No parallel approval artefact. No parallel filing model.
- No direct HMRC calls outside the proxy.
- No tax figures stored as source data in filing tables.
- No secrets or bearer tokens in migrations, logs, or audit.
- No edits to existing core tables without a flagged, approved proposal.
- No UI work unless strictly required for OAuth callback testing.
- Do not advance past Sprint 0.
