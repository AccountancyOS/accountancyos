# Filing Engine v2 — Sprint 0 Acceptance Hardening

Status: **Hardening pass complete.** No Sprint 1 functionality built. No new HMRC
endpoints beyond Hello World. No legacy caller migrated.

This converts Sprint 0 from "implemented with known gaps" toward "accepted
foundation" by closing the two acceptance gaps (live-DB tenant proof, allowlisted
legacy callers) with runnable tests, CI enforcement, an inventory, and explicit
documentation of what remains externally blocked.

---

## 1. Live-DB Tenant Isolation Proof — EXTERNALLY BLOCKED (harness delivered)

A runnable harness was authored: `scripts/tests/tenant-isolation.ts`. It signs in
as two synthetic users in two organisations and asserts:

- Org A cannot **read** Org B `filings`, `filing_model_snapshots`, `filing_approvals`.
- Org A cannot **read** Org B `organization_integrations_hmrc` (HMRC integration data).
- Org A cannot **read** Org B `filing_provider_events` (filing audit events).
- Org A cannot **write** Org B `filing_provider_events` / `filings` (RLS denial).
- Control: Org A **can** read its own org (proves the queries aren't trivially empty).
- Optional: with `FUNCTIONS_URL` set, the deployed `hmrc-call-proxy` returns **403**
  when user A passes `organization_id = Org B` (service-role path validates ownership
  via `requireOrgContext`, which checks membership before using the admin client).

It reuses the same RLS helper every tenant table uses
(`public.user_has_organization_access`) — no parallel tenant logic.

### Why it cannot run in this environment
This container has **no outbound network and no privileged credentials**. Captured evidence:

| Check | Result |
|---|---|
| `GET https://<ref>.supabase.co/rest/v1/` (anon) | **HTTP 403** (egress blocked by sandbox proxy) |
| `GET .../auth/v1/token?grant_type=password` (mint test JWTs) | **HTTP 403** |
| Direct Postgres `db.<ref>.supabase.co:5432` | connection blocked (psql errored, no route) |
| `SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL` in env | not present |
| Test-user credentials / org ids | not provided |

### Exact dependencies required to run it (CI/staging)
1. Network egress to the Supabase project (or a disposable Postgres).
2. `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
3. Two seeded test users in two different orgs with passwords:
   `TEST_USER_A_EMAIL/PASSWORD`, `TEST_USER_B_EMAIL/PASSWORD`.
4. `TEST_ORG_A_ID`, `TEST_ORG_B_ID`.
5. (Optional) `FUNCTIONS_URL` of the deployed edge functions for the ownership check.

Run: `deno run -A scripts/tests/tenant-isolation.ts`.
`scripts/tests/sprint0-enforcement.sql` provides the complementary schema/immutability/RLS-enabled assertions via `psql`.

---

## 2. CI Enforcement — DONE

`.github/workflows/sprint0-acceptance.yml` runs on push (`main`, `claude/**`) and PRs to `main`:

```bash
bun run test:sprint0      # logic + governance invariants (13/13)
deno task test            # edge integration tests (hmrc-client.test.ts)
```

- Sets up Bun (`oven-sh/setup-bun`) and Deno (`denoland/setup-deno`).
- The **no-new-direct-HMRC-caller guard runs in CI**, not just locally: if any
  edge function outside the allowlist references an HMRC host, `bun run test:sprint0`
  fails the job. Proven locally with a synthetic new caller:
  `detectDirectHmrcCalls(...)` → `violations: ["supabase/functions/sneaky-new-caller/index.ts"]`.

---

## 3. Legacy Direct HMRC Caller Inventory — DONE (no migration performed)

Code-derived inventory of the 7 allowlisted legacy callers. Real outbound = makes a
live HMRC request today; sandbox-mock = no real outbound yet.

| Function | Protocol / Endpoint | Auth | Real outbound | Idempotency | Rate limit | Token refresh | Fraud headers | Audit tables |
|---|---|---|---|---|---|---|---|---|
| **hmrc-vat-obligations** | MTD REST `GET /organisations/vat/{vrn}/obligations` | Bearer (encrypted token) | Yes | n/a (read) + 1h cache | No | Yes (inline) | 1 of full set (`Connection-Method`) | `vat_obligations`, `filing_provider_events` (VRN masked) |
| **hmrc-vat-submit** | MTD REST `POST /organisations/vat/{vrn}/returns` | Bearer (encrypted token) | Yes | Yes (`idempotency_key`) | Yes (5/min) | No (assumes valid) | 2 (`Connection-Method`, `User-IDs`) | `filing_submissions`, `filings`, `audit_log` (unredacted payloads) |
| **hmrc-ct-submit** | GovTalk Transaction Engine `POST /submission` | Gateway ID + MD5 password (envelope) | Yes | Yes | Yes (5/min) | n/a (not OAuth) | None (GovTalk uses envelope auth) | `filing_artefacts`, `filing_submissions`, `filings`, `filing_queue`, `audit_log` |
| **hmrc-ct-poll** | GovTalk `POST /submission` (poll) | Gateway ID + MD5 | Yes | n/a (correlationId) | n/a | n/a | None | `filing_queue`, `filings`, `filing_artefacts`, `filing_submissions`, `audit_log` |
| **hmrc-ct-delete** | GovTalk `POST /submission` (delete) | Gateway ID + MD5 | Yes | n/a | n/a | n/a | None | `filing_queue`, `filings`, `filing_artefacts`, `audit_log` |
| **rti-submit** | RTI (production not implemented) | none (sandbox mock) | No | None | None | None | None | `rti_submissions`, `filings` |
| **cis-submit** | CIS (production not implemented) | none (sandbox mock) | No | None | None | None | None | `cis_returns`, `filings` |

### Per-function migration risk & recommended order
| Order | Function | Risk | Rationale |
|---|---|---|---|
| 1 | hmrc-vat-obligations | LOW–MED | Read-only, already refreshes token; simplest; establishes REST-via-proxy pattern; unblocks fraud-header completeness |
| 2 | hmrc-vat-submit | MED | JSON REST; idempotency+rate-limit already present; needs full fraud headers + token refresh via `getValidHmrcAccessToken`; keep VAT reconciliation gate local |
| 3 | hmrc-ct-submit + poll + delete (as a unit) | HIGH | GovTalk XML, 3 generated artefacts, queue-coupled polling; **MD5 gateway creds are NOT OAuth — keep the credential gate in the function**; route through proxy for audit/redaction only (fraud headers N/A for GovTalk); preserve `filing_queue` polling |
| 4 | rti-submit | LOW | Sandbox-only; migrate scaffold when the production RTI spec is built |
| 5 | cis-submit | LOW | Sandbox-only; migrate scaffold when the production CIS spec is built |

### Cross-cutting findings to address during migration (not now)
- VAT functions send only 1–2 of the required fraud headers → wire the full set via the proxy.
- Several legacy audit writes store **unredacted** payloads/responses → adopt `redactSecrets`/`redactHeaders` on migration.
- hmrc-vat-submit does not refresh tokens → switch to `getValidHmrcAccessToken`.
- CT GovTalk credential gate (`HMRC_CT_GATEWAY_ID/PASSWORD`) must remain in-function (not OAuth).

---

## 4. Hello World Sandbox Execution — EXTERNALLY BLOCKED

The proxy path (`action: "hello_world"`) is implemented and unit-proven (audited,
redacted, correlation-id captured — see `hmrc-client.test.ts`). A real sandbox run
requires the deployed Supabase edge runtime + outbound egress + HMRC sandbox app.

Captured evidence of blockage: `GET https://test-api.service.hmrc.gov.uk/hello/world`
→ **HTTP 403** (egress blocked). The live call was **not faked**.

### Exact dependencies required to run it (CI/staging)
1. Outbound network to `test-api.service.hmrc.gov.uk`.
2. Deployed `hmrc-call-proxy` edge function (Supabase project) with secrets:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
   `HMRC_SANDBOX_BASE_URL` (defaulted), `GOV_VENDOR_PRODUCT_NAME/VERSION/LICENSE_IDS`.
3. An authenticated user JWT for an org (to pass `requireOrgContext`).
4. (For authenticated HMRC scopes later) HMRC sandbox `HMRC_CLIENT_ID/SECRET` and a
   connected org. `/hello/world` itself is open and needs no HMRC token.

Then: `POST {FUNCTIONS_URL}/hmrc-call-proxy` body `{"action":"hello_world","environment":"sandbox"}`
and assert: 200, a `filing_provider_events` row written, no token in the audit, correlation id captured when returned.

---

## 5. Fraud-Prevention Header Validation Plan (before production)

Local tests prove the headers are **constructed and attached**; they do **not** prove
**HMRC acceptance**. Validate against HMRC's *Test Fraud Prevention Headers* API
before any production filing.

1. **Connect a sandbox app** (`HMRC_CLIENT_ID/SECRET`, MTD IT test user) and route a
   real sandbox call through `hmrc-call-proxy`.
2. **Submit headers for validation** — call HMRC's validation endpoint
   `GET /test/fraud-prevention-headers/validate` (Test Fraud Prevention Headers API)
   with the exact `Gov-Client-*`/`Gov-Vendor-*` set the proxy attaches, via a thin
   `action:"request"` proxy call so the same merge code path is exercised.
3. **Assert zero `errors`** in the response and triage every `warning`
   (e.g. timestamp formats, `Gov-Client-Public-IP` provenance, screen/window encoding).
4. **Fix gaps** in `_shared/hmrc-fraud-prevention.ts` (server merge) and
   `src/hmrc/fraud-prevention.ts` (browser collection); re-run until clean.
5. **Per-endpoint check** — validate for each connection scenario actually used
   (VAT obligations GET, VAT returns POST) since required headers vary by method.
6. **Lock it in CI** — add a staging job that fails if the validation endpoint
   reports any `error` (gated on sandbox secrets being present).
7. **Re-validate on change** — any edit to the fraud modules must re-run step 2–3.

Do not claim fraud-prevention compliance from local tests alone; compliance =
a clean response from HMRC's validation endpoint in sandbox.

---

## Definition of Done — status
| # | Criterion | Status |
|---|---|---|
| 1 | Live DB tenant-isolation tests run or explicitly blocked with reasons | ✅ Blocked with captured evidence + exact missing deps; runnable harness delivered |
| 2 | CI runs Sprint 0 tests automatically | ✅ `.github/workflows/sprint0-acceptance.yml` |
| 3 | Legacy direct HMRC callers inventoried | ✅ §3 (7 functions, risk + order) |
| 4 | No-new-direct-HMRC-caller guard enforced in CI | ✅ `bun run test:sprint0` in CI; guard proven to fail on synthetic new caller |
| 5 | Hello World run in sandbox OR blocked pending credentials | ✅ Blocked pending creds + egress; evidence captured; not faked |
| 6 | Fraud-prevention validation plan documented | ✅ §5 |
| 7 | No Sprint 1 functionality built | ✅ Confirmed |

Externally blocked items (1, 4-sandbox) are blocked solely by missing network egress
and credentials in this environment — both are fully runnable in CI/staging with the
dependencies listed above.
