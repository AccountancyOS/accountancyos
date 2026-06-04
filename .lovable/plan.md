
# Client Portal Migration — Batch 1 (Isolated Import + Route Shell)

This plan covers only the **first migration step**: get the portal code in, isolated, with routes mounted, unsafe features disabled, and mapping docs scaffolded. **No new tables. No production wiring of broken services.** Service adaptation happens in later batches once the mapping doc is filled in.

## Scope of Batch 1

In scope:
- Extract portal zip and import a curated subset under `src/portal/`
- Mount `/portal/*` route shell with guards
- Disable unsafe features (bookkeeping writes, TrueLayer, mock data, fake notification saves)
- Create the three required docs
- Keep app compiling; existing accountant routes untouched

Out of scope (later batches):
- Adapting services to the accountant schema
- Any new tables, RPCs, RLS, storage policies
- Any portal-side write paths
- Real backend wiring of pages beyond placeholder shells

## Target structure

```text
src/portal/
  routes/PortalRoutes.tsx         # nested <Routes> mounted at /portal/*
  guards/PortalGuard.tsx          # auth + portal-access boundary
  layouts/PortalLayout.tsx        # Sidebar/Header adapted from imported code
  pages/                          # Login, Invite, Dashboard, Tasks, Documents,
                                  # Questionnaires, Messages, Payments, Bookkeeping, Settings
  components/                     # imported portal-specific UI only
  hooks/                          # portal hooks (visibility, portal entity, etc.)
  services/                       # PortalXxxService.ts — return typed DTOs
  types/                          # PortalUserContext, PortalTask, PortalDocument, ...
  utils/
  legacy-reference/               # quarantined raw imports for reference only,
                                  # excluded from bundle via a barrel that re-exports nothing
```

Mount in `src/App.tsx`:
```text
<Route path="/portal/*" element={<PortalRoutes />} />
```
Existing accountant routes remain untouched.

## What gets imported from the zip

Imported and adapted under `src/portal/`:
- Pages: `Auth`, `auth/PortalInvite`, `Index` (dashboard), `Tasks`, `Documents`, `Questionnaires`, `QuestionnaireResponse`, `Conversations` (renamed Messages), `Payments`, `Settings`, `Deadlines`, `FinancialOverview`, `NotFound`
- Components: `dashboard/*`, `tasks/*`, `documents/*`, `questionnaires/*`, `payments/*`, `deadlines/*`, `conversations/*`, `financial/*`, `bookkeeping/*` (display-only), `shared/*`, `layout/*` (renamed PortalLayout/PortalSidebar/PortalHeader/PortalMobileNav)
- Hooks: `usePortalVisibility`, portal-specific only (skip `use-toast`, `use-mobile` — use existing ones)
- Types: `types/portal.ts`, `types/index.ts`, `types/bookkeeping.ts` → trimmed into `src/portal/types/`
- Contexts: `PortalEntityContext`, `ThemeContext` (if not duplicated) — `AuthContext` is dropped in favour of existing `useAuth`

Explicitly NOT imported:
- `.env`, `bun.lockb`, `package*.json`, `components.json`, `eslint.config.js`, `index.html`, `tsconfig*`, `vite.config*`, `tailwind.config*`, `public/*`, `supabase/*`
- `src/integrations/supabase/client.ts` and `src/integrations/supabase/types.ts` (use the existing accountant client/types)
- `src/integrations/supabase/accountant-schema.ts` (shadow types)
- `src/services/clientPortalApi.ts`, `src/services/bookkeepingApi.ts`, `src/services/mockData.ts` (broken backend + mock — replaced by `src/portal/services/*` stubs)
- All `src/pages/banking/*` and `src/pages/bookkeeping/Banking*`, `BillCreate`, `Bills`, `InvoiceCreate`, `InvoiceDetails`, `Invoices`, `Customers`, `Suppliers`, `Transactions` (TrueLayer + bookkeeping writes — disabled this sprint)
- Any `App.tsx`, `App.css`, `main.tsx`, `Index` routing shells (replaced by `PortalRoutes`)

The dropped pages’ navigation entries in the imported `Sidebar`/`MobileNav` are stripped before import.

## Route map

```text
/portal/login                    → PortalLogin (Auth.tsx adapted)
/portal/invite                   → PortalInvite (token-based, server-validated)
/portal                          → redirect to /portal/dashboard
/portal/dashboard                → PortalDashboard
/portal/tasks                    → PortalTasks
/portal/documents                → PortalDocuments
/portal/questionnaires           → PortalQuestionnaires
/portal/questionnaires/:id       → PortalQuestionnaireResponse
/portal/messages                 → PortalMessages
/portal/payments                 → PortalPayments
/portal/bookkeeping              → PortalBookkeeping (read-only)
/portal/settings                 → PortalSettings
/portal/*                        → PortalNotFound
```

All routes except `/portal/login` and `/portal/invite` are wrapped in `<PortalGuard>`. The guard:
- Requires an authenticated Supabase user (`getUser()`).
- Calls a single service `getPortalUserContext()` (stub in Batch 1 — returns `null` for now, which the guard treats as "no portal access" and redirects to `/portal/login`).
- Blocks accountant-side routes from being entered as a portal user (handled in Batch 2 once `portal_access` is wired).

Accountant users hitting `/portal/*` without an explicit impersonation flag are also bounced to `/portal/login` so they can sign in as the client.

## Service adapter contract (stubs only in Batch 1)

Every imported page consumes typed DTOs from `src/portal/services/*`. Batch 1 ships these as stub modules that return `null`/empty arrays so the UI renders empty states without touching the DB. Real wiring is Batch 2+.

Stubs to create:
- `getPortalUserContext()` → `PortalUserContext | null`
- `getPortalClientProfile()` → `PortalClientProfile | null`
- `listPortalEntities()` → `PortalEntity[]`
- `listPortalTasks()` → `PortalTask[]`
- `listPortalDocuments()` → `PortalDocument[]`
- `listPortalQuestionnaires()` / `getPortalQuestionnaire(id)` / `submitPortalQuestionnaire(...)`
- `listPortalConversations()` / `listPortalMessages(threadId)` / `sendPortalMessage(...)`
- `listPortalPayments()`
- `getPortalFinancialSummary()`
- `getPortalVisibilitySettings()`

Each stub has a `// TODO(batch-2): map to <existing accountant table/RPC>` comment that points at the mapping doc.

## Frozen / disabled features

Hidden in nav and gated at the route level with a "Coming soon" placeholder if reachable:
- All bookkeeping writes (invoice/bill create, payment record, categorise, ledger edit, VAT-affecting writes)
- TrueLayer: bank connect buttons, OAuth start/callback, refresh, reconnect
- Fake notification preference saves (toggle UI removed in Settings)
- Hardcoded financial trends + mock activity feed (widgets show neutral empty states)

## Auth model

- Single Supabase client (existing `@/integrations/supabase/client`).
- Portal login reuses the existing auth setup; no new auth instance.
- Invite flow: `/portal/invite?token=...` — token validated server-side (Batch 2 wires the edge function; Batch 1 renders the UI with a stub call that errors gracefully).
- Password reset uses the existing `/reset-password` page; the portal login page links to it.
- No standalone organisations created from the portal.

## Docs created in Batch 1

- `docs/portal-import-plan.md` — file-by-file import decisions, dropped items, risks
- `docs/portal-schema-mapping.md` — table seeded with one row per portal area, `Action = TBD`, to be filled in Batch 2 before any service wiring
- `docs/portal-disabled-features.md` — TrueLayer, bookkeeping writes, notification prefs, mock trends/activity

## Acceptance for Batch 1

- App compiles; existing accountant routes work unchanged.
- `/portal/login` renders.
- `/portal/dashboard` (and the rest) render as empty-state shells behind `PortalGuard`.
- No new tables, RPCs, RLS, or edge functions.
- No imports from `src/portal/legacy-reference/` reach the bundle.
- No bookkeeping write code paths exist in `src/portal/`.
- No TrueLayer code paths exist in `src/portal/`.
- The three docs above exist.
- Memory updated: replace the "Dual Project Deployment" core rule with a single-project rule noting `/portal/*` lives under `src/portal/` and uses the accountant backend.

## Technical Details

- Routing: nested `<Routes>` under a single `<Route path="/portal/*">` to keep the portal router self-contained. `PortalLayout` provides Sidebar+Header; outlet renders the page.
- Guard order in `PortalGuard`: session check → `getUser()` → `getPortalUserContext()` → either render `<Outlet />` or `<Navigate to="/portal/login" replace />`.
- Imported components keep using shadcn `@/components/ui/*` (already present in accountant project) — duplicate UI primitives from the zip are not imported.
- Imported types are renamed with a `Portal` prefix where they collide with accountant types.
- The `accountant-schema.ts` shadow types file is deleted on import; all DB calls go through the existing generated `Database` type via `@/integrations/supabase/client`.
- A small `src/portal/services/_disabled.ts` exports a `disabledFeature(name)` helper used by the gated routes/buttons so the reason surfaces consistently.
- Memory edits: update `mem://index.md` Core, mark `mem://architecture/dual-project-isolated-deployment` as superseded with a pointer to a new `mem://architecture/single-project-portal-under-src-portal` memory.

## Out-of-scope reminder

Batches 2+ will: fill in `portal-schema-mapping.md`, adapt each service to the real accountant schema (`organization_id`, `portal_access`, `client_messages`, `job_tasks`, `questionnaire_instances`, `invoices`, etc.), wire the invite edge function, add any minimal RPCs that turn out to be genuinely required, and only then enable each portal area route-by-route.
