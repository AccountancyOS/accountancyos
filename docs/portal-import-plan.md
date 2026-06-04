# Client Portal — Import Plan (Batch 1)

The standalone client-portal Lovable project has been retired. The portal is
being merged into this accountant project as a second application surface,
isolated under `src/portal/` and mounted at `/portal/*`. The accountant app
remains the primary application and the only source of truth for data.

## Route namespace

- All portal pages live under `/portal/*`.
- `/portal/login` and `/portal/invite` are public.
- Every other portal route is wrapped in `PortalGuard` + `PortalLayout`.
- The existing accountant route `/portal/preview/:entityType/:entityId`
  continues to render the accountant-side preview; React Router v6 picks the
  more specific static route, so it is not shadowed by `/portal/*`.

## Import structure

```
src/portal/
  routes/PortalRoutes.tsx
  guards/PortalGuard.tsx
  layouts/PortalLayout.tsx
  pages/                # Login, Invite, Dashboard, Tasks, Documents,
                        # Questionnaires, QuestionnaireResponse, Messages,
                        # Payments, Bookkeeping, Settings, NotFound
  components/           # PortalPageHeader, PortalEmptyState
  services/             # Stub services returning typed DTOs
  types/                # Portal-domain DTOs
  hooks/, utils/        # (reserved for Batch 2+)
```

No portal component is mounted outside `src/portal/`.

## Files imported (this batch)

| Area | Imported From Zip | Action |
|------|-------------------|--------|
| Type design (`PortalEntity`, `PortalDocument`, ...) | `src/types/portal.ts` | Adapted into `src/portal/types/index.ts`, renamed where collisions exist |
| Portal navigation shape | `src/components/layout/Sidebar.tsx` | Conceptually adapted into `PortalLayout`; old nav items pointing at disabled routes (banking, customers, invoices, bills, suppliers) were dropped |
| Auth flow | `src/pages/Auth.tsx`, `src/pages/auth/PortalInvite.tsx` | Replaced by `PortalLogin` and `PortalInvite` using the existing `@/integrations/supabase/client` |
| Page surface area | `src/pages/{Index,Tasks,Conversations,Documents,Questionnaires,Deadlines,Payments,Settings,FinancialOverview}.tsx` | Replaced by empty-state shells in `src/portal/pages/`; real UI is restored in Batch 2 once services are wired |

## Files explicitly NOT imported

| File / Folder | Reason |
|---------------|--------|
| `.env`, `bun.lockb`, `package*.json`, `components.json`, `eslint.config.js`, `index.html`, `tsconfig*`, `vite.config*`, `tailwind.config*`, `public/*`, `supabase/*` | Project-level config; this project owns its own |
| `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts` | The accountant app's generated client + types are the single source of truth |
| `src/integrations/supabase/accountant-schema.ts` | Shadow schema layer; superseded by the real generated types |
| `src/services/clientPortalApi.ts`, `src/services/bookkeepingApi.ts`, `src/services/mockData.ts` | Bound to the broken portal backend; replaced by stub services in `src/portal/services/` |
| `src/pages/banking/*`, `src/pages/bookkeeping/{Banking*,BillCreate,Bills,Customers,InvoiceCreate,InvoiceDetails,Invoices,Suppliers,Transactions}` | Either TrueLayer (disabled) or bookkeeping writes (disabled). See `portal-disabled-features.md` |
| `src/App.tsx`, `src/App.css`, `src/main.tsx` | Routing/bootstrap is owned by this app |
| `src/contexts/AuthContext.tsx` | Uses the existing `@/lib/auth-context` and `@/integrations/supabase/client` |

## Backend assumptions

- Single Supabase backend (this accountant project).
- Single Supabase client (`@/integrations/supabase/client`).
- No new tables, RPCs, RLS policies, storage buckets, or edge functions added
  in Batch 1.
- All portal data flows through `src/portal/services/*`. Pages consume typed
  DTOs only — raw Supabase rows never leak into portal UI components.

## Disabled features (Batch 1)

See `docs/portal-disabled-features.md`.

- Bookkeeping writes (invoice/bill creation, payments, categorisation,
  ledger edits, VAT-affecting writes).
- TrueLayer / bank-connection UI.
- Notification-preference saving (UI removed rather than fake-persisting).
- Hardcoded financial trends and mock activity feeds.

## Risks

- Schema reconciliation is deferred to Batch 2. Until then, every portal page
  renders an empty state. This is intentional — no service is wired against
  an unmapped table.
- Accountant users hitting `/portal/*` are bounced to the portal login. An
  explicit impersonation / support mode is a Batch 3 concern.
- The invite acceptance flow is rendered but not yet functional; tokens are
  validated server-side in Batch 2 via an edge function.

## Out of scope for Batch 1

- Adapting services to real accountant tables.
- Any new migrations, RPCs, RLS, storage policies, or edge functions.
- Wiring real data into any portal page.
- Cross-surface guard enforcement (blocking portal users from accountant
  routes) beyond the simple session check.