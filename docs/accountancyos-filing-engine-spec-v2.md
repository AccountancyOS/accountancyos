# AccountancyOS Filing Engine — Technical Specification (v2, re-rooted)

**For:** Claude Code build agent
**Supersedes:** v1 (HMRC-rooted draft). This version incorporates the Pre–Sprint 0 Architecture Validation.
**Scope:** UK HMRC Self Assessment (legacy SA) and Making Tax Digital for Income Tax (MTD IT / MTD ITSA), designed as one consumer of a shared spine that also serves VAT, CT and RTI.
**Stack:** React + Supabase (Postgres) + Deno edge functions.
**Engineering standard:** production-grade, server-side correctness, DB constraints over frontend checks, centralised logic, scale-ready, full test coverage. No “good enough”.

-----

## 0. What changed from v1 — read this first

v1 was technically competent but **HMRC-rooted**: its entity tree and canonical model were organised around HMRC nouns, and the canonical object was return-shaped. Built as-is it would have produced a filing product sitting beside the accounting OS rather than downstream of it. v2 corrects this. The non-negotiable principles:

1. **The ledger is the root of all data. The Approved Financial Model is the source of truth for income/corporation tax filings.** Filings are **read-only projections** of an approved, versioned artefact — never a store of figures.
1. **No submission may exist without an immutable reference to the approved artefact it was derived from.** Enforced in Postgres, not the frontend.
1. **The HMRC engine is a transport / obligation / audit layer.** It stores payloads, references and responses. It stores **no figures of record**.
1. **One spine, consumed at the layer appropriate to each tax** (see §3). Income/corp tax project the Approved Financial Model; VAT and RTI tap the ledger and payroll subledger at transaction grain with their own periodic gates.
1. **Single master AccountancyOS HMRC software application.** AccountancyOS holds the software credentials centrally; each practice holds its own Agent Services Account; OAuth joins them.
1. **Naming is load-bearing.** Store = `ApprovedFinancialModel`. Outputs = `…Projection`. The word “return” never appears on a stored model — only on a projection.

What survives unchanged from v1: OAuth mechanics, fraud-prevention header handling, the HMRC endpoint inventory, the submission state machine, retries/idempotency/audit, compliance gates, and the test strategy. These are relocated, not rewritten.

-----

## 1. The spine — canonical architecture

### 1.1 The data spine (source of truth)

```
LEDGER  ── transaction grain, the root of everything
   │
   ├─────────────────────────────► (VAT taps here: VAT codes per transaction)
   │
   ▼
ADJUSTMENTS  ── posted once, between ledger and model
   │
   ▼
NORMALISED FINANCIAL MODEL  ── the single income/expense/balance model
   │
   ▼
WORKPAPERS  ── evidence and computation supporting the model
   │
   ▼
REVIEW
   │
   ▼
APPROVAL ──► APPROVED FINANCIAL MODEL VERSION  (immutable, hash-sealed)
   │
   ▼
FILINGS  ── projections of the approved version (SA, MTD IT, CT)

PAYROLL SUBLEDGER  ── separate grain; feeds the ledger; RTI taps here per pay run
```

**Invariant:** a filing is a pure function of an approved, versioned artefact. Re-running the projection over the same approved version must produce a byte-identical payload (deterministic mapping). If two filings disagree, it is because they project different approved versions — never because a figure was edited in the filing layer.

### 1.2 The operating-model spine (workflow)

Every piece of work routes through one path, regardless of tax:

```
Client
  └─ Service              (e.g. "MTD IT", "Self Assessment", "VAT", "Annual Accounts + CT")
       └─ Job             (a unit of work for a period, e.g. "2026-27 Q1 MTD IT update")
            └─ Questionnaire   (collects accounting information — never HMRC form fields)
                 └─ Workpaper  (transforms collected info into model inputs)
                      └─ Approval   (gate; produces/uses an Approved Financial Model Version)
                           └─ Filing     (projection → submission)
```

There is exactly one workflow system. MTD IT and SA are **configurations of Service/Job**, not separate operating systems.

### 1.3 What the user does — and does not — do

- Users complete **questionnaires that collect accounting information** (income, expenses, adjustments, evidence).
- Users **review and approve** the financial model.
- Users **never complete HMRC forms directly.** The system maps approved accounting data into HMRC payloads. A user never types into an “SA103 box 17”; they answer an accounting question and the mapper places it.

-----

## 2. Strategic context (two regimes, one engine)

### 2.1 Regimes

|Regime   |Population                                                |Mechanism                                                                |Consumes                                                             |
|---------|----------------------------------------------------------|-------------------------------------------------------------------------|---------------------------------------------------------------------|
|MTD IT   |Sole traders + landlords above qualifying-income threshold|Granular JSON REST APIs: quarterly cumulative updates + final declaration|Approved Financial Model (final decl.); model-in-progress (quarterly)|
|Legacy SA|Everyone in SA not yet in MTD IT                          |SA100 + supplementary pages via XML SA Online API                        |Approved Financial Model (annual)                                    |

Mandation phasing (verify against GOV.UK at build time):

- **6 Apr 2026** — qualifying income > £50,000 (determined by 2024/25 figures)
- **6 Apr 2027** — > £30,000 (2025/26)
- **6 Apr 2028** — > £20,000 (2026/27), subject to final legislation

Out of MTD IT scope (still SA): partnerships, companies, trusts, estates, no-NINO, residence/remittance-pages filers, below-threshold non-opt-ins.

### 2.2 Regime routing — sourced from the model, not recomputed

```ts
// libs/filing/regime-router.ts  (pure function, 100% branch coverage required)
function regimeForClientYear(
  client: Client,
  taxYear: TaxYearCode,
  qualifyingIncome: QualifyingIncomeFromModel,   // ← supplied BY the financial model, never recomputed here
  hmrcMtdStatus: MtdStatusFromHmrc                // ← from Self Assessment Individual Details API
): 'mtd_it' | 'legacy_sa' | 'none'
```

The qualifying-income figure is produced by the financial model’s reporting layer (gross self-employment + property income for the determining year). The router compares it to the threshold and reconciles with HMRC’s reported MTD status. It does not touch the ledger directly.

-----

## 3. Layered-spine filing architecture (cross-tax)

The unifying principle proven against all five taxes, so silos cannot reappear:

|Tax            |Consumes                                                       |Grain                |Gate                                         |Calculation                            |Transport                             |
|---------------|---------------------------------------------------------------|---------------------|---------------------------------------------|---------------------------------------|--------------------------------------|
|Self Assessment|Approved Financial Model                                       |Annual               |Full approval                                |HMRC computes                          |XML SA Online API                     |
|MTD IT         |Approved Financial Model (final); model-in-progress (quarterly)|Quarterly + annual   |Quarterly: light review; Final: full approval|HMRC `Individual Calculations`         |MTD JSON REST APIs                    |
|Corporation Tax|Approved Financial Model → statutory accounts → CT computation |Annual               |Full approval                                |CT computation engine on approved model|iXBRL + CT600 (no MTD-style API today)|
|VAT            |**Ledger** (VAT codes per transaction)                         |Quarterly (typically)|Light periodic review                        |Mechanical from ledger                 |VAT (MTD) API                         |
|RTI            |**Payroll subledger** (employee-level per pay run)             |Per pay run          |Payroll approval per run                     |Payroll engine                         |RTI (FPS/EPS)                         |

**Invariant (layer-appropriate):** every filing is a read-only projection of an *approved, versioned* artefact — but the artefact differs by layer. Income/corp tax project the Approved Financial Model; VAT projects the ledger; RTI projects the payroll subledger. The **ledger is the single root** of all of them. Income is modelled once; adjustments live once; no tax calculation is re-implemented (HMRC calculates income tax; VAT is mechanical; CT has one computation engine).

> This spec **builds the SA + MTD IT engine**. VAT, CT and RTI are documented here only as *consumers of the same spine*, to prove the model. Their engines are later work and must not be stubbed into this build — but the data model must already accommodate them.

-----

## 4. HMRC environments and credentials (master-app model)

### 4.1 Base URLs

|Environment|Base URL                              |
|-----------|--------------------------------------|
|Sandbox    |`https://test-api.service.hmrc.gov.uk`|
|Production |`https://api.service.hmrc.gov.uk`     |

### 4.2 Credential model — central software app + per-practice ASA

AccountancyOS is the **software vendor**. It holds **one** HMRC software application per environment (sandbox + production), centrally:

- `client_id`, `client_secret`, `server_token`
- production approval, fraud-prevention sign-off, software recognition listing — all done **once, by AccountancyOS**

Each **practice (tenant)** holds its **own Agent Services Account (ASA)** with its own Agent Reference Number (ARN). This is the practice’s regulatory identity as a tax agent (tied to AML supervision and professional body) and cannot be held centrally.

OAuth joins them: a practice authorises the AccountancyOS software application by signing in with its **own ASA** Government Gateway credentials. Tokens are stored **per practice**, scoped to that practice’s ARN. Clients are linked to their practice’s authorisations.

**Optional future escape hatch (do not build now):** design the authorisation layer so a single enterprise tenant *could* later supply its own software credentials. Ship master-app as the only path for the foreseeable roadmap.

### 4.3 Secrets

Master software credentials live in Supabase Vault, one set per environment, **not per tenant**:

```
hmrc.{env}.client_id
hmrc.{env}.client_secret
hmrc.{env}.server_token
hmrc.{env}.redirect_uri
```

Per-practice OAuth tokens (and per-client OAuth tokens where the client authorises directly) live encrypted in `hmrc_oauth_tokens` (see §6), keyed by tenant/ARN — **not** in Vault-as-secrets.

-----

## 5. HMRC API inventory (transport layer)

Build a thin typed client per API. Versions change frequently — **resolve and pin at build time** in `hmrc/versions.ts` by reading the live API docs; assert the version in every `Accept` header.

### 5.1 MTD IT APIs to build

|API                                      |Purpose                                                           |Flow                |
|-----------------------------------------|------------------------------------------------------------------|--------------------|
|Create Test User                         |Generate sandbox users                                            |Test only           |
|Hello World                              |Smoke-test OAuth + fraud headers                                  |Healthcheck         |
|Agent Authorisation                      |Request/cancel/check agent–client relationship                    |Onboarding          |
|Self Assessment Individual Details (MTD) |Client’s MTD status for a year                                    |Onboarding / routing|
|Business Details (MTD)                   |List business income sources + HMRC IDs                           |Discovery           |
|Obligations (MTD)                        |Quarterly/annual period dates + met status                        |“What’s due”        |
|Self-Employment Business                 |Cumulative period summary, annual submission, annual adjustments  |Quarterly + annual  |
|Property Business                        |UK + foreign property cumulative period summary, annual submission|Quarterly + annual  |
|Individual Income                        |Dividends, savings, pensions, foreign, etc.                       |Annual              |
|Individual Losses (MTD)                  |Brought-forward + loss claims                                     |Year-end            |
|CIS Deductions (MTD)                     |Construction Industry Scheme deductions                           |Where applicable    |
|Business Income Source Summary (BISS)    |Per-source summary for display                                    |Display             |
|Business Source Adjustable Summary (BSAS)|Trigger/retrieve/adjust per source                                |Year-end            |
|Individual Calculations (MTD)            |Trigger, list, retrieve calc; **submit Final Declaration**        |Year-end            |
|Self Assessment Accounts (MTD)           |Liabilities, charges, payments, balance                           |Reconciliation      |
|Self Assessment Test Support (MTD)       |Delete stateful sandbox data                                      |Test only           |
|Individual Benefits / Employment         |PAYE pre-pop                                                      |Optional            |

### 5.2 Legacy SA

|API                         |Purpose                                                             |
|----------------------------|--------------------------------------------------------------------|
|Self Assessment Online (XML)|SA100 + SA102/SA103/SA105/SA106/SA108 etc. via XML envelope + IRmark|

Separate XML builder/submitter module. No shared request/response code with the JSON MTD client.

### 5.3 Out of scope here

VAT (MTD), Corporation Tax (no filing API; iXBRL/CT600), PAYE/RTI — separate engines, documented in §3 only as spine consumers.

-----

## 6. Database schema (Supabase / Postgres)

RLS on every table; tenant isolation enforced at DB level. Full DDL goes in migration files; this is the authoritative shape.

### 6.1 The spine tables (source of truth — owned by AccountancyOS core, referenced here)

These are assumed to exist (or be built) in the accounting core. The filing engine **depends on** them and must not duplicate them.

```sql
-- tenants(id, ...)                          -- a practice
-- users(id, tenant_id, ...)
-- clients(id, tenant_id, ...)

-- ledger_entries(id, tenant_id, client_id, ...)          -- transaction grain (root)
-- adjustments(id, tenant_id, client_id, ...)
-- financial_models(id, tenant_id, client_id, period, ...) -- working model
-- workpapers(id, tenant_id, client_id, financial_model_id, ...)

-- THE GATE: immutable approved versions
create table approved_financial_model_versions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  client_id         uuid not null references clients(id) on delete restrict,
  period_key        text not null,                 -- e.g. '2026-27' or '2026-27-Q1'
  scope             text not null check (scope in ('annual','quarter','adhoc')),
  model_snapshot    jsonb not null,                -- the frozen normalised model
  snapshot_hash     text not null,                 -- sha256 of model_snapshot, sealed
  approved_by       uuid not null references users(id),
  approved_at       timestamptz not null default now(),
  superseded_by     uuid references approved_financial_model_versions(id),
  immutable         boolean not null default true,
  unique (snapshot_hash)
);
-- Immutability enforced by trigger: no UPDATE to model_snapshot/snapshot_hash after insert.
```

> If the core does not yet expose `approved_financial_model_versions`, **that is a blocking dependency** (see §13 sprint 0) — the filing engine cannot be correct without it. Do not work around it by storing figures in the filing layer.

### 6.2 Filing-engine tables (transport / obligation / audit — NO figures of record)

```sql
-- ===== Master app registration (NOT per tenant) =====
create table hmrc_apps (
  id            uuid primary key default gen_random_uuid(),
  environment   text not null check (environment in ('sandbox','production')) unique,
  client_id_vault_ref     text not null,
  client_secret_vault_ref text not null,
  server_token_vault_ref  text,
  redirect_uri  text not null,
  created_at    timestamptz not null default now()
);
-- One row per environment, globally. Not tenant-scoped.

-- ===== Practice (tenant) <-> HMRC via its own ASA =====
create table hmrc_agent_authorisations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  environment   text not null check (environment in ('sandbox','production')),
  agent_reference_number text not null,            -- the practice's OWN ARN
  access_token_vault_ref  text not null,
  refresh_token_vault_ref text not null,
  access_token_expires_at timestamptz not null,
  refresh_token_first_issued_at timestamptz not null,
  scopes_granted text[] not null,
  status        text not null check (status in ('active','expired','revoked')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index on hmrc_agent_authorisations (tenant_id, environment) where status='active';

-- ===== Client <-> HMRC per-service authorisation =====
create table hmrc_client_authorisations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  client_id     uuid not null references clients(id) on delete cascade,
  hmrc_service  text not null check (hmrc_service in ('mtd-it','vat','cis')),
  agent_type    text check (agent_type in ('main','supporting')),
  status        text not null check (status in ('pending','active','expired','rejected','cancelled')),
  invitation_id text,
  authorised_at timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);
create unique index on hmrc_client_authorisations (client_id, hmrc_service) where status='active';

-- ===== OAuth token store (encrypted) =====
create table hmrc_oauth_tokens (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  subject_type  text not null check (subject_type in ('agent','client')),
  subject_id    uuid,                              -- client_id when subject_type='client'
  environment   text not null,
  access_token_enc  bytea not null,                -- pgsodium
  refresh_token_enc bytea not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

-- ===== HMRC's view of business sources (reference data, not figures) =====
create table hmrc_business_sources (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  client_id         uuid not null references clients(id) on delete cascade,
  hmrc_business_id  text not null,
  source_type       text not null check (source_type in ('self-employment','uk-property','foreign-property')),
  accounting_type   text check (accounting_type in ('CASH','ACCRUALS')),
  raw_hmrc          jsonb not null,                -- as returned, for audit
  fetched_at        timestamptz not null default now(),
  unique (client_id, hmrc_business_id)
);

-- ===== Obligations (HMRC-derived schedule) =====
create table obligation_periods (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  client_id         uuid not null references clients(id) on delete cascade,
  hmrc_business_source_id uuid references hmrc_business_sources(id) on delete cascade,
  obligation_type   text not null check (obligation_type in ('quarterly','annual','final-declaration')),
  tax_year          text not null,
  period_start      date not null,
  period_end        date not null,
  due_date          date not null,
  status            text not null check (status in ('open','fulfilled','overdue')),
  received_at_hmrc  timestamptz,
  raw_hmrc          jsonb not null,
  refreshed_at      timestamptz not null default now(),
  check (period_end >= period_start),
  check (due_date >= period_end)
);
create index on obligation_periods (client_id, tax_year, due_date);

-- ===== Projections (the rendered payload — derived, not authored) =====
create table filing_projections (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  client_id         uuid not null references clients(id) on delete cascade,
  -- HARD LINK TO THE APPROVAL GATE: a projection cannot exist without an approved source
  approved_model_version_id uuid not null references approved_financial_model_versions(id) on delete restrict,
  projection_kind   text not null check (projection_kind in (
    'mtd_it_self_employment_period','mtd_it_uk_property_period','mtd_it_foreign_property_period',
    'mtd_it_self_employment_annual','mtd_it_uk_property_annual','mtd_it_foreign_property_annual',
    'mtd_it_dividends','mtd_it_savings','mtd_it_pensions','mtd_it_foreign_income','mtd_it_charitable_giving',
    'mtd_it_cis','mtd_it_losses','mtd_it_bsas_adjustment',
    'mtd_it_trigger_calculation','mtd_it_final_declaration',
    'sa100_legacy'
  )),
  rendered_payload  jsonb not null,                -- deterministic projection output
  payload_hash      text not null,                 -- sha256(rendered_payload)
  source_hash       text not null,                 -- = approved_model_versions.snapshot_hash at render time
  created_at        timestamptz not null default now()
);
create index on filing_projections (client_id, projection_kind, created_at desc);

-- ===== Submissions (one per attempt; transport state only) =====
create table submissions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  client_id         uuid not null references clients(id) on delete cascade,
  filing_projection_id uuid not null references filing_projections(id) on delete restrict,
  obligation_period_id uuid references obligation_periods(id),
  attempt_number    int not null default 1,
  idempotency_key   text not null,
  state             text not null check (state in (
    'ready','submitting','accepted_by_hmrc',
    'rejected_validation','auth_expired','duplicate','rate_limited','retry_pending','failed_terminal'
  )),
  response_status   int,
  response_body     jsonb,
  hmrc_correlation_id text,
  hmrc_reference    text,                          -- calculationId, submissionId, IRmark, etc.
  submitted_at      timestamptz,
  accepted_at       timestamptz,
  next_retry_at     timestamptz,
  error_summary     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);
create index on submissions (state, next_retry_at) where state in ('retry_pending','rate_limited');

-- ===== Calculations + BSAS (HMRC results, not our figures) =====
create table tax_calculations (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  client_id         uuid not null references clients(id) on delete cascade,
  tax_year          text not null,
  hmrc_calculation_id text not null,
  calculation_type  text not null check (calculation_type in ('in-year','final-declaration')),
  status            text not null check (status in ('triggered','calculated','errored','superseded')),
  triggered_at      timestamptz not null,
  calculated_at     timestamptz,
  full_payload      jsonb,                         -- HMRC's calculation
  unique (client_id, hmrc_calculation_id)
);

create table bsas_records (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  client_id         uuid not null,
  hmrc_business_source_id uuid not null references hmrc_business_sources(id),
  tax_year          text not null,
  hmrc_bsas_id      text not null,
  state             text not null check (state in ('triggered','retrieved','adjusted','submitted','superseded')),
  pre_adjustment    jsonb,
  adjustments       jsonb,                         -- adjustments MUST originate from an approved model delta
  post_adjustment   jsonb,
  unique (hmrc_bsas_id)
);

-- ===== Audit: every outbound HMRC call, ever =====
create table hmrc_call_audit (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  client_id         uuid,
  submission_id     uuid references submissions(id),
  endpoint          text not null,
  method            text not null,
  http_status       int,
  request_headers   jsonb not null,                -- incl. fraud-prevention headers
  request_body      jsonb,                         -- retain 7 years
  response_headers  jsonb,
  response_body     jsonb,
  hmrc_correlation_id text,
  duration_ms       int,
  called_at         timestamptz not null default now()
);
create index on hmrc_call_audit (tenant_id, called_at desc);
create index on hmrc_call_audit (hmrc_correlation_id);

-- ===== User-facing timeline =====
create table filing_events (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  client_id         uuid not null,
  tax_year          text,
  event_type        text not null,
  message           text not null,
  related_submission_id uuid references submissions(id),
  metadata          jsonb,
  occurred_at       timestamptz not null default now()
);
```

### 6.3 The constraints that enforce the architecture

These are the teeth. Without them the architecture is advisory.

1. **Approval gate (the most important constraint in the system):** `filing_projections.approved_model_version_id` is `NOT NULL` with `ON DELETE RESTRICT`, and `submissions.filing_projection_id` is `NOT NULL`. A submission therefore *cannot exist* without tracing to an immutable approved model version. No code path can bypass it.
1. **Immutability trigger** on `approved_financial_model_versions`: reject any `UPDATE` to `model_snapshot` or `snapshot_hash`. Supersession is a new row + `superseded_by` pointer, never an edit.
1. **Source-hash consistency check:** a trigger asserts `filing_projections.source_hash = approved_financial_model_versions.snapshot_hash` at insert. If the approved model changed, you must re-project — you cannot submit a stale projection against a new approval.
1. **State-machine trigger** on `submissions`: enforce the legal transition graph (§7.2); forbid e.g. `accepted_by_hmrc → ready`. Write a `filing_events` row on every transition.
1. **Period sanity** CHECKs on `obligation_periods` (already inline above).
1. **Single active authorisation** partial unique indexes (already inline).
1. **RLS** on every table: tenant isolation; a practice sees only its own clients and its own ARN’s authorisations.
1. **Encryption:** `pgsodium` for `nino`/`utr` (wherever they live in core) and all token columns; Vault for master software credentials.

### 6.4 What is deliberately NOT in these tables

No income figures. No expense figures. No adjustments of record. No “SA storage” or “MTD storage” of accounting data. The only `jsonb` figure-bearing columns are `rendered_payload` (a derived projection), `raw_hmrc` (HMRC’s own data, for audit), and HMRC calculation results. The figures of record live exclusively in the spine.

-----

## 7. Filing state machine + protocol

### 7.1 Projection → submission

```
Approved Financial Model Version (immutable)
        │  deterministic mapper
        ▼
filing_projection (rendered_payload + source_hash)
        │
        ▼
submission (state machine below)
```

### 7.2 Submission states

```
ready
  ↓ submit
submitting
  ├── 2xx ─→ accepted_by_hmrc
  ├── 4xx ─→ rejected_validation     (terminal until re-projected & resubmitted)
  ├── 401 ─→ auth_expired            (refresh token → retry)
  ├── 409 ─→ duplicate               (reconcile via read endpoint → accepted)
  ├── 429 ─→ rate_limited            (back off → retry)
  └── 5xx/network ─→ retry_pending   (exp. backoff; verify-before-resubmit)
```

Transitions occur only inside the `filing-state-machine` module, mirrored by the DB trigger.

### 7.3 OAuth 2.0 (user-restricted)

Authorization Code grant. `access_token` lasts 4 hours (`expires_in=14400`); `refresh_token` is single-use; after 18 months a full re-auth is required. Agent authorises using the practice’s **own ASA** sign-in. Scopes requested narrowly per operation (`read:self-assessment`, `write:self-assessment`, etc.); verify granted scopes in the token response.

### 7.4 Fraud-prevention headers (statutory)

Connection method `WEB_APP_VIA_SERVER`. Browser-side collector gathers `Gov-Client-*`; server merges `Gov-Vendor-*` (identifying AccountancyOS — consistent with the master app) at the single `hmrc-call-proxy` chokepoint. Every header set is audited. **No edge function calls HMRC except through the proxy.** Build our own collector (no third-party dep in the audit path); HMRC’s spec at the fraud-prevention guide governs the exact fields — resolve at build time.

### 7.5 Headers, errors, rate limiting

`Accept: application/vnd.hmrc.{version}+json` (pinned). `HmrcApiError` preserves status, top-level + per-field codes, and `X-CorrelationId`. Token-bucket limiter per `(tenant, environment)` (Postgres advisory-lock or KV; no Redis in Supabase); default 3 req/s; exponential backoff on 429.

### 7.6 Idempotency

Key = `tenant + client + filing_projection_id + attempt`. Before any retry after 5xx, call HMRC’s read endpoint to confirm whether the prior attempt landed. Never blind-resubmit.

-----

## 8. Edge function inventory (Deno)

Shared framework first (per standing rule). No per-function reinvention.

```
_shared/
  framework/  handler.ts · auth.ts · errors.ts · logging.ts · tracing.ts · response.ts
  spine/      approved-model-reader.ts   # reads approved versions; the ONLY way figures enter the engine
              projection-guard.ts        # asserts source_hash freshness before submit
  hmrc/
    client.ts · fraud-prevention.ts · error-mapper.ts · oauth.ts · versions.ts
    api/  agent-authorisation · business-details · obligations ·
          self-employment-business · property-business · individual-income ·
          individual-calculations · bsas · individual-losses · cis-deductions ·
          self-assessment-accounts · self-assessment-individual-details ·
          individual-employment · individual-benefits · create-test-user · sa-online-xml
  projection/
    mtd-it/  se-period · property-period · annual · non-business · losses · cis · final-declaration
    sa100/   sa100-builder (XML)
  validation/  zod-schemas/   # per HMRC request/response
  state-machine/  submission-state-machine.ts
```

Functions (each a `createHandler`): OAuth (`start`/`callback`/`refresh`); `agent-authorisation-{create,status,cancel}`; `client-mtd-status-check`; `client-business-details-sync`; `obligations-refresh`; `project-and-submit-period`; `project-and-submit-annual`; `project-and-submit-non-business`; `bsas-{trigger,retrieve,submit-adjustments}`; `calculation-{trigger,retrieve}`; `final-declaration-submit`; `self-assessment-accounts-sync`; `submission-reconciler` (cron); `sa100-{render,submit,poll-ack}`; `create-test-user` / `delete-test-data` (sandbox).

**Hard rule:** every `project-and-submit-*` function (a) reads figures **only** via `approved-model-reader`, (b) renders a `filing_projection` row, (c) passes `projection-guard`, (d) submits through `hmrc-call-proxy`, (e) persists in one transaction. There is no path from raw user input to HMRC that skips the approved model.

-----

## 9. End-to-end flows

### 9.1 Onboarding (MTD IT)

Add client → `agent-authorisation-create` (practice’s ASA + NINO + service + agent type) → email invitation → client accepts on HMRC → cron `agent-authorisation-status` → `client-mtd-status-check` → `client-business-details-sync` → `obligations-refresh` → client appears with first due date.

### 9.2 Quarterly (self-employment)

Bookkeeping + adjustments → workpaper → **light quarterly review/approval** → Approved Financial Model Version (`scope='quarter'`) → `project-and-submit-period` reads it, renders `filing_projection`, guards source hash, submits cumulative period summary → ~1h later `obligations-refresh` confirms fulfilled.

### 9.3 Year-end + final declaration

All quarters fulfilled → annual submissions per source → non-business income → BSAS trigger/retrieve/adjust (adjustments derive from an approved model delta) → `calculation-trigger` (in-year) → present for client approval → **full approval** → Approved Financial Model Version (`scope='annual'`) → `calculation-trigger` (final-declaration) → retrieve → `final-declaration-submit` → `self-assessment-accounts-sync` presents balance + payment dates.

### 9.4 Legacy SA

Same spine up to approval → `sa100-render` projects the approved model to XML → `sa100-submit` → `sa100-poll-ack` (IRmark).

-----

## 10. Projection & mapping rules

- **One canonical store, many projections.** `approved-model-reader` returns the immutable `model_snapshot`. Mappers in `projection/` are **pure, deterministic** functions: same approved version ⇒ byte-identical payload.
- **No tax calculation on our side** for income tax: HMRC’s `Individual Calculations` computes liability; we orchestrate and display. Our only computation is aggregation (already done in the model), threshold checks (fed by the model), consolidated-expenses eligibility (turnover ≤ £90k), and structural validation.
- **Validation in two layers:** Zod on the approved model snapshot (sanity), then Zod on each projected payload (HMRC-specific rules). Both required.
- **Quarterly figures are cumulative** year-to-date, not deltas — confirm against the live HMRC schema.

-----

## 11. Reliability, observability

Retry 30s→1m→5m→30m→2h→8h→24h, max 7, only for 5xx/network/429. Per-endpoint circuit breaker (open 5min after 5 consecutive 5xx/1min). Dead-letter → `failed_terminal` + alert. Capture `X-CorrelationId` on every call. 7-year retention for `hmrc_call_audit` and `filing_projections.rendered_payload`. OpenTelemetry metrics per endpoint/tenant; alerts on `failed_terminal`, stuck `submitting` >5min, and obligations past due without an accepted submission.

-----

## 12. HMRC compliance (gates before production) — done once, centrally

Because of the master-app model, these are completed **once by AccountancyOS**, not per practice:

1. Production approvals checklist (supported endpoints, fraud prevention, agent journeys, accessibility).
1. Sandbox end-to-end testing of every endpoint in the MTD IT minimum functionality standards.
1. Fraud-prevention spec sign-off (HMRC reviews real headers — engage HMRC’s Software Developer Support Team early).
1. Software recognition listing.
1. Multiple-agent support (main + supporting agent) at the ASA level.

`compliance/` directory: `production-approvals-checklist.md`, `recognition-criteria.md`, `sanctions-and-fines.md`, `dpia.md`.

-----

## 13. Test strategy

|Layer                    |What                                                                                                 |Tooling     |
|-------------------------|-----------------------------------------------------------------------------------------------------|------------|
|Unit                     |Mappers, validators, regime router, **state machine**, **fraud-prevention builder**, **error mapper**|Vitest      |
|Property                 |Projection determinism: same approved version ⇒ identical payload; mutate-and-re-project equivalence |fast-check  |
|Integration (mocked HMRC)|Edge functions vs recorded sandbox fixtures                                                          |Vitest + msw|
|Contract (live sandbox)  |`Gov-Test-Scenario` exercised for every branch of every endpoint                                     |Deno test   |
|E2E                      |Full quarterly + final declaration cycle in sandbox with HMRC test users                             |Playwright  |

**Coverage gates (no “good enough”):** 100% branch on state machine, regime router, fraud-prevention builder, error mapper, **and the approval-gate enforcement**; ≥90% on mappers/validators; every edge function has happy + failure path; every HMRC endpoint has a nightly live sandbox contract test. **Add an explicit test that no submission can be created without an approved-model-version reference** (attempt to insert one and assert the DB rejects it).

-----

## 14. Build order (sprints)

|Sprint                    |Output                                                                                                                                                                                                                                                                                   |Done when                                                                                                                                                                        |
|--------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|**0 — Foundations + gate**|Shared framework; Vault wiring (master app); fraud-prevention collector; base `HmrcClient` (audit + retries); OAuth start/callback/refresh against practice ASA; Hello World; **and the `approved_financial_model_versions` table + approval-gate constraints + `approved-model-reader`**|A Hello World call succeeds with full fraud headers, fully audited; and a test proves no `filing_projection`/`submission` can exist without an immutable approved-model reference|
|1 — Onboarding            |Agent Authorisation; Individual Details; Business Details; Obligations                                                                                                                                                                                                                   |New sandbox client → confirmed MTD status → visible obligations                                                                                                                  |
|2 — Quarterly             |SE + UK/foreign property period projections + submission; state machine; reconciler                                                                                                                                                                                                      |All four quarterly updates submitted across sources from approved quarter-scope versions, with retries + audit                                                                   |
|3 — Annual + non-business |Annual submissions; dividends/savings/pensions/foreign/charitable; CIS; losses                                                                                                                                                                                                           |Full annual data projected + submitted                                                                                                                                           |
|4 — BSAS + calculation    |BSAS trigger/retrieve/adjust; in-year calculation retrieve/display                                                                                                                                                                                                                       |In-year calc displayed from an approved model                                                                                                                                   |
|5 — Final declaration     |Final-declaration calc; final declaration submit; Accounts sync                                                                                                                                                                                                                          |Full year-end filing completed in sandbox                                                                                                                                       |
|6 — Legacy SA             |XML SA Online client; SA100 projection; submit + IRmark                                                                                                                                                                                                                                  |Legacy SA filing completed for a test user                                                                                                                                       |
|7 — Recognition prep      |Production approvals; full contract suite; DPIA; fraud sign-off                                                                                                                                                                                                                          |Production credentials applied for (once, centrally)                                                                                                                             |
|8 — Production pilot      |Internal Blue Tick clients; controlled monitoring                                                                                                                                                                                                                                        |First real MTD IT filing accepted by HMRC                                                                                                                                        |

**Sprint 0 gating dependency:** if the accounting core does not yet expose approved, versioned financial models, that interface must be built in Sprint 0 before any projection work. The filing engine reads it; it must not store figures to compensate for its absence.

-----

## 15. Decisions still open

1. **Quarterly approval weight** — confirm quarterly updates use a *light* review/approval (quarter-scope approved version) distinct from the full annual approval. (Recommended: yes.)
1. **Bridging** — CSV/spreadsheet import as an MVP path into the ledger/model, or AccountancyOS bookkeeping only?
1. **Supporting agents** — support main + supporting agent model from day one or main-only initially?
1. **Capital Gains** for MTD-IT clients (no MTD endpoint) — route via legacy SA pages / standalone CGT service. Confirm.
1. **Enterprise escape hatch** — confirm we design the auth layer to *allow* a future per-tenant software app but ship master-only now.
1. **Core dependency** — confirm `approved_financial_model_versions` (or equivalent) is owned by core and exposes a stable read interface for the engine.

-----

## 16. References (resolve at build time)

API index: <https://developer.service.hmrc.gov.uk/api-documentation/docs/api> ·
MTD IT end-to-end guide: <https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/> ·
Fraud prevention: <https://developer.service.hmrc.gov.uk/guides/fraud-prevention/> ·
User-restricted auth: <https://developer.service.hmrc.gov.uk/api-documentation/docs/authorisation/user-restricted-endpoints> ·
Reference guide: <https://developer.service.hmrc.gov.uk/api-documentation/docs/reference-guide> ·
Agent Authorisation API: <https://github.com/hmrc/agent-authorisation-api> ·
HMRC GitHub (OAS specs): <https://github.com/hmrc> ·
API catalogue: <https://www.api.gov.uk/hmrc/>

-----

**End of spec v2.** The single sentence that governs every decision: *filings are deterministic projections of an immutable approved artefact rooted in the ledger; the HMRC engine transports and audits them but never owns a figure.*
