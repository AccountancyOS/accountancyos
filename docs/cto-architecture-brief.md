# AccountancyOS — CTO Architecture Brief

**Purpose:** Give an engineering leader full context on how this system is built so they can suggest changes safely.  
**Last updated:** 2026-02-18

---

## 1. What This Is

AccountancyOS is a **multi-tenant practice management SPA** for UK accounting firms (≤10 staff). It covers the full client lifecycle: CRM → Quotes → Onboarding → AML → Bookkeeping → Tax Workpapers → Filing (SA/CT/VAT/CS01) → Automation → Email → Billing.

There are **two separate frontend apps** sharing **one backend**:

| App | Purpose | Tech |
|-----|---------|------|
| **Accountant App** | Full-featured practice tool (45 routes) | React 18 + Vite + TypeScript + Tailwind |
| **Client Portal** | Read-only client-facing app (white-labelable) | Same stack, separate project/deployment |

---

## 2. Runtime Architecture

```
┌──────────────────────────────────────────────────┐
│              FRONTEND (React SPA)                 │
│  React 18 · Vite · TypeScript · Tailwind          │
│  TanStack Query for server state                  │
│  Supabase JS SDK for all backend comms            │
│  No SSR · No middleware · Client-only routing      │
└──────────────┬───────────────────────────────────┘
               │ HTTPS (anon key + user JWT)
               ▼
┌──────────────────────────────────────────────────┐
│            SUPABASE (Shared Backend)               │
│                                                    │
│  ┌─────────────┐  ┌───────────────────────────┐   │
│  │   Auth       │  │  PostgreSQL                │   │
│  │  email/pass  │  │  177 tables                │   │
│  │  magic links │  │  553 RLS policies          │   │
│  │  (no SSO)    │  │  ~30 DB functions          │   │
│  └─────────────┘  └───────────────────────────┘   │
│                                                    │
│  ┌─────────────┐  ┌───────────────────────────┐   │
│  │  Storage     │  │  40 Edge Functions (Deno)  │   │
│  │  4 buckets   │  │  See §5 for full list      │   │
│  └─────────────┘  └───────────────────────────┘   │
└──────────────────────────────────────────────────┘
               │
               ▼ (outbound from Edge Functions only)
    ┌──────────────────────────────────────┐
    │        External Services              │
    │  Stripe · HMRC · Companies House      │
    │  TrueLayer · Gmail · Outlook          │
    │  Postmark (system emails only)        │
    └──────────────────────────────────────┘
```

**Key constraint:** The frontend has **no server-side rendering and no middleware**. All security enforcement is via Supabase RLS + Edge Functions. The frontend is purely a presentation layer.

---

## 3. Tenant Isolation Model

Every domain table has an `organization_id` column. Isolation is enforced at three layers:

| Layer | Mechanism |
|-------|-----------|
| **Row-Level Security** | Every SELECT/INSERT/UPDATE/DELETE policy calls `user_has_organization_access(org_id)` — a `SECURITY DEFINER` function that checks `organization_users` |
| **Edge Functions** | `requireOrgContext()` in `_shared/auth.ts` validates JWT → looks up `organization_users` → verifies role + org membership |
| **Frontend** | `useOrganization()` context provides `orgId`; all queries include it. But this is defense-in-depth, not primary enforcement |

### Role Hierarchy

```
owner > admin > manager > staff > viewer
```

Roles are stored in `organization_users.role`. The frontend permission system (`src/lib/permissions.ts`) maps ~40 named permissions to role tiers. The backend (`supabase/functions/_shared/permissions.ts`) has a parallel but simpler permission model.

**⚠️ Known issue:** The DB constraint on `organization_users.role` currently only allows `owner|admin|staff`. The `manager` and `viewer` roles exist in code but cannot be written to the database. This is documented in the audit and needs a migration to fix.

---

## 4. Data Spine (Source of Truth Flow)

```
Ledger Entries (bookkeeping_accounts + ledger_entries + journals)
       │
       ▼
Trial Balance (computed or imported CSV)
       │
       ▼
Workpaper Instances (workpaper_instances table, JSONB schedule data)
       │
       ▼
Filing Draft (filings.draft_schedule_data_json — mutable JSONB)
       │
       ▼ [Lock / "Send to Client"]
Filing Model Snapshot (filing_model_snapshots — IMMUTABLE, includes TB + CoA state)
       │
       ▼
Accounts Model (FRS105 balance sheet + P&L computation)
       │
       ▼
iXBRL / XML Generation (deterministic from snapshot)
       │
       ▼
Filing Artefacts (filing_artefacts — generated iXBRL/XML/PDF stored)
       │
       ▼
Submission (Edge Function → HMRC/CH API)
```

**Critical invariant:** Once a `filing_model_snapshot` is created, the filing output must be a pure deterministic function of that snapshot. The snapshot captures TB balances, CoA tax mappings, and mapping rule versions at lock time.

---

## 5. Edge Functions (40 total)

| Category | Functions | Auth |
|----------|-----------|------|
| **Email OAuth** | `gmail-auth`, `gmail-callback`, `gmail-exchange`, `gmail-sync`, `gmail-send` | Mixed (auth flows are public callbacks) |
| **Email OAuth** | `outlook-auth`, `outlook-callback`, `outlook-exchange`, `outlook-sync`, `outlook-send` | Mixed |
| **HMRC** | `hmrc-auth`, `hmrc-callback`, `hmrc-vat-submit`, `hmrc-vat-obligations`, `hmrc-ct-submit`, `hmrc-ct-poll`, `hmrc-ct-delete` | Mixed |
| **Companies House** | `ch-submit`, `companies-house-sync` | JWT required |
| **Banking** | `truelayer-auth`, `truelayer-callback`, `truelayer-sync` | Mixed |
| **Payments** | `stripe-webhook`, `stripe-checkout`, `stripe-connect-onboard`, `stripe-connect-charge`, `customer-portal`, `check-subscription` | Mixed |
| **Filings** | `generate-filing-pdf`, `rti-submit`, `cis-submit` | JWT required |
| **Email Sending** | `send-email`, `send-engagement-letter`, `process-email-queue` | Mixed |
| **Automation** | `process-automation-events`, `workflow-tick` | No JWT (cron) |
| **Utility** | `fx-rates`, `sla-check`, `session-cleanup` | Mixed |

All JWT-verified functions use `requireOrgContext()` from `_shared/auth.ts` which validates the token, looks up org membership, and optionally checks permissions.

---

## 6. Frontend Architecture

### State Management
- **Server state:** TanStack Query (React Query v5) with a centralized `queryKeys.ts` registry
- **Auth state:** `AuthContext` → wraps Supabase `onAuthStateChange`
- **Org state:** `OrganizationContext` → loads from `organization_users`, provides `orgId` + `role`
- **No Redux, no Zustand, no global stores** — all state is either server-derived or local component state

### Key Libraries
- `shadcn/ui` (Radix primitives + Tailwind) for all UI components
- `react-hook-form` + `zod` for form validation
- `recharts` for dashboards
- `@xyflow/react` for automation workflow builder
- `@dnd-kit` for drag-and-drop
- `framer-motion` (via Tailwind animations) for transitions
- `mathjs` for formula evaluation (safe — no `eval()`)
- `dompurify` for HTML sanitization (email rendering)

### Routing
- `react-router-dom` v6 with 45 routes
- Protected routes check auth + org membership
- No code splitting currently (single bundle)

### Design System
- All colors via HSL CSS variables in `index.css` (`--primary`, `--background`, etc.)
- Light + dark mode support via `next-themes`
- Components NEVER use raw color classes — always semantic tokens

---

## 7. Database Shape (Summary)

**177 tables** across 13 domains:

| Domain | Key Tables | Table Count |
|--------|-----------|-------------|
| **Org & Auth** | `organizations`, `organization_users`, `org_settings`, `team_invitations` | 8 |
| **CRM** | `leads`, `quotes`, `quote_lines`, `lead_activities` | 4 |
| **Onboarding** | `onboarding_applications`, `engagement_letters`, `onboarding_documents` | 3 |
| **Clients** | `clients`, `companies`, `client_services`, `portal_access` | 12 |
| **Bookkeeping** | `bookkeeping_accounts`, `ledger_entries`, `journals`, `invoices`, `bills`, `vat_codes` | ~25 |
| **Banking** | `bank_connections`, `bank_accounts`, `bank_transactions`, `bank_rules` | 6 |
| **Jobs** | `jobs`, `job_tasks`, `job_deadlines`, `job_templates`, `job_artifacts` | 10 |
| **Workpapers** | `workpaper_templates`, `workpaper_instances`, `questionnaire_*` | 10 |
| **Filings** | `filings`, `filing_artefacts`, `filing_model_snapshots`, `filing_approvals` | 8 |
| **Payroll** | `employees`, `pay_runs`, `pay_run_lines`, `payroll_*` | 8 |
| **Automations** | `automation_rules`, `automation_workflow_*`, `automation_trigger_contracts` | 12 |
| **Email** | `connected_mailboxes`, `synced_emails`, `email_queue` | 5 |
| **Tax Rates** | `sa_rate_tables`, `ca_rate_tables`, `ct_rate_tables` | 5+ |

**553 RLS policies** enforce tenant isolation, role-based access, and record immutability.

---

## 8. Integration Map

| Service | Auth | What We Send | What We Receive | Source of Truth |
|---------|------|-------------|-----------------|-----------------|
| **Stripe** | API key + webhooks | Checkout sessions, Connect onboarding | Payment confirmations, subscription status | Stripe (payments) / Our DB (billing status) |
| **HMRC** | OAuth2 (per-org tokens in `hmrc_credentials`) | SA XML, CT600 XML, VAT JSON, RTI XML, CIS XML | Submission receipts, correlation IDs, obligations | HMRC (acceptance status) / Our DB (filing content) |
| **Companies House** | API key | CS01 XML, officer sync requests | Company profiles, officer data, filing receipts | CH (company data) / Our DB (filing records) |
| **TrueLayer** | OAuth2 (per-connection tokens) | Auth requests, sync requests | Bank transactions, account balances | TrueLayer (transactions) / Our DB (reconciliation state) |
| **Gmail** | OAuth2 (per-user tokens) | Send requests, sync requests | Email messages, thread data | Gmail (emails) / Our DB (synced copies + client matching) |
| **Outlook** | OAuth2 (per-user tokens) | Same as Gmail | Same as Gmail | Same as Gmail |
| **Postmark** | API key | System emails (invites, magic links, password reset) | Delivery status | Postmark (delivery) |

---

## 9. What NOT to Touch (Fragile / Critical Paths)

| Path | Why It's Fragile | What Breaks |
|------|-----------------|-------------|
| `organization_users` RLS policies | Primary tenant isolation gate | ALL data access across ALL tables |
| `ledger_entries` + `journals` posting logic | Balance validation + period locks happen in `posting-service.ts` | Unbalanced ledger, locked period bypass |
| `filing_model_snapshots` immutability | Guarantees filing reproducibility | Compliance — filed numbers must match locked snapshot |
| `automation_workflow_instances` state machine | `workflow-tick` advances steps based on `status` + `current_step_id` | Duplicate jobs, skipped chasers, stuck workflows |
| `emit_automation_event()` DB function | Trigger bridge — writes to `automation_events` on record changes | All automation stops firing |
| Tax rate tables (`sa_rate_tables`, `ca_rate_tables`, etc.) | All tax computations reference these | Wrong tax calculations on every filing |

---

## 10. Known Technical Debt & Security Issues

Full details in `docs/adversarial-audit-results.md`. Headlines:

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Any authenticated user can INSERT into `organization_users` (tenant bypass) | 🔴 CRITICAL | Needs RLS migration |
| 2 | DB constraint blocks `manager`/`viewer` roles (permission matrix is non-functional for 2/5 roles) | 🔴 CRITICAL | Needs constraint migration |
| 3 | `journals` RLS has conflicting PERMISSIVE policies (direct insert bypasses posting service) | 🔴 HIGH | Needs RESTRICTIVE policy |
| 4 | `filing_artefacts` are mutable after creation (compliance risk) | 🔴 HIGH | Needs immutability policy |
| 5 | Engagement letter signatures can be forged by org members | 🔴 HIGH | Needs column-level restriction |
| 6 | Filing status can be set to `accepted` without HMRC submission | 🔴 HIGH | Needs status transition trigger |
| 7 | `connected_mailboxes` OAuth tokens exposed to client SDK | 🟡 MEDIUM | Needs view + column security |
| 8 | Invoice voiding doesn't reverse ledger entries | 🟡 MEDIUM | Needs service logic fix |
| 9 | Non-atomic ledger posting (sequential inserts, no transaction) | 🟡 MEDIUM | Needs RPC wrapper |
| 10-17 | Various workflow, VAT, and concurrency issues | 🟡 MEDIUM | See audit doc |

---

## 11. Safe Change Patterns

### ✅ Safe to change
- **UI components** — purely presentational, no backend coupling
- **New pages/routes** — just add to router, wrap in auth guard
- **New Edge Functions** — self-contained, add to `supabase/config.toml`
- **Design tokens** — CSS variables in `index.css`, propagate automatically
- **Query logic** — TanStack Query hooks are isolated per feature
- **New tables** — add with proper RLS, no impact on existing

### ⚠️ Change with caution
- **RLS policies** — test with multiple roles before deploying; PERMISSIVE vs RESTRICTIVE matters enormously
- **DB functions** (`SECURITY DEFINER`) — these bypass RLS; audit call sites
- **Automation trigger contracts** — workflow templates reference these by key; changing keys breaks running instances
- **Filing/workpaper schema** — snapshot format is serialized JSONB; schema changes need migration logic for existing snapshots
- **Edge Function auth** — `verify_jwt` in config.toml; setting to `false` on a protected function = open endpoint

### 🚫 Do NOT change without full regression
- `organization_users` table or its RLS
- `ledger_entries` / `journals` / `posting-service.ts`
- `filing_model_snapshots` schema or immutability constraints
- Tax rate tables or computation engines
- `_shared/auth.ts` or `_shared/permissions.ts` (edge function auth layer)

---

## 12. How to Add a New Feature (Checklist)

1. **Need a new table?** → Create migration with RLS policies. Every table needs `organization_id` + tenant isolation policy.
2. **Need server-side logic?** → Create Edge Function in `supabase/functions/<name>/index.ts`. Add to `config.toml`. Use `requireOrgContext()` for auth.
3. **Need to store secrets?** → Use Supabase secrets (edge function env vars). Never in code.
4. **Need a new permission?** → Add to BOTH `src/lib/permissions.ts` AND `supabase/functions/_shared/permissions.ts`. They are parallel systems.
5. **Need automation?** → Define trigger contract in `automation_trigger_contracts`. Create workflow template + steps. Bridge via `emit_automation_event()`.
6. **Need external API?** → OAuth flow as Edge Function pair (`<service>-auth` + `<service>-callback`). Store tokens in DB. Sync via separate function.
7. **Frontend component?** → Use `shadcn/ui` primitives. Semantic color tokens only. Wrap in permission check if needed.

---

## 13. File Map (Where to Find Things)

```
src/
├── components/          # ~200 React components (shadcn + custom)
├── hooks/               # ~60 custom hooks (data fetching, mutations)
├── lib/                 # ~95 service files (business logic, engines)
│   ├── permissions.ts   # Frontend role → permission mapping
│   ├── posting-service.ts # Ledger posting logic
│   ├── filing-service.ts  # Filing lifecycle
│   ├── invoice-service.ts # Invoice lifecycle
│   ├── workflow-orchestrator.ts # Automation step advancement
│   ├── ixbrl-generator.ts # iXBRL document generation
│   └── ...
├── pages/               # Route-level page components
├── integrations/
│   └── supabase/
│       ├── client.ts    # Auto-generated, DO NOT EDIT
│       └── types.ts     # Auto-generated from DB schema, DO NOT EDIT
└── index.css            # Design tokens (HSL CSS vars)

supabase/
├── config.toml          # Edge function config, auto-managed
├── functions/
│   ├── _shared/         # Shared utils (auth, supabase client, logging, permissions)
│   ├── stripe-webhook/  # Stripe event handler
│   ├── hmrc-*/          # HMRC OAuth + submission functions
│   ├── workflow-tick/   # Cron: advances automation workflows
│   └── ...              # 40 functions total
└── migrations/          # SQL migrations (DO NOT EDIT existing ones)

docs/
├── full-system-specification.md  # Exhaustive technical spec
├── adversarial-audit-results.md  # Security audit findings
└── cto-architecture-brief.md     # This document
```

---

## 14. Tech Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React | 18.3 |
| Build | Vite | latest |
| Language | TypeScript | strict mode |
| Styling | Tailwind CSS + shadcn/ui | v3 + latest |
| Server State | TanStack Query | v5 |
| Forms | react-hook-form + zod | v7 / v3 |
| Routing | react-router-dom | v6 |
| Database | PostgreSQL (via Supabase) | 15 |
| Auth | Supabase Auth | email/password + magic links |
| Edge Functions | Deno (Supabase Edge) | latest |
| External | Stripe, HMRC, CH, TrueLayer, Gmail, Outlook, Postmark | Various |

---

*For the full 1300-line technical specification, see `docs/full-system-specification.md`.*  
*For security audit findings and hardening plan, see `docs/adversarial-audit-results.md`.*
