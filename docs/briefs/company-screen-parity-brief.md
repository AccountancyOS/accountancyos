# Company screen ↔ Client screen parity

**Goal:** a company client (`/companies/:id` → `src/pages/CompanyDetail.tsx`) should offer the same
workspace features as an individual client (`/clients/:id` → `src/pages/ClientPortal.tsx`). Today
`CompanyDetail` is missing several tabs the client screen has. Bring them across — reusing existing
components in `companyId` mode. Do NOT fake a tab whose component can't actually handle a company.

## Ground truth (from recon — build on this)
- `ClientPortal.tsx` tabs (list ~:138-151): Portal, Conversations, Emails, Jobs, Documents, Contacts,
  Questionnaires, Workpapers, Deadlines, Services, Billing, Settings.
- `CompanyDetail.tsx` tabs (list ~:243-283): Overview, Registers, Jobs, CoSec Jobs, Payroll (gated),
  Documents, Services (now with add-service), Settings.
- **Missing on the company screen:** Conversations, Emails, Contacts, Questionnaires, Workpapers,
  Deadlines, Billing.
- The client-facing tab components live in `src/components/client-portal/`. Several already accept
  `{ clientId?, companyId? }` (confirmed: `ConversationsTab` supports `companyId` — it's just never
  mounted with it; `client_messages` has a `client_id XOR company_id` CHECK, so company mode is valid).

## Task
For EACH missing tab (Conversations, Emails, Contacts, Questionnaires, Workpapers, Deadlines, Billing):
1. Find the component the client screen uses for it and **read its props + queries**. Determine
   whether it genuinely supports a company entity — i.e. it accepts `companyId` AND its queries/mutations
   use `company_id` (or an entity-agnostic path), not a hardcoded `client_id`.
2. **If it supports company mode:** add the tab to `CompanyDetail.tsx` (a `TabsTrigger` + `TabsContent`),
   mounting the component with `companyId={companyId}` (and `clientId` null/omitted). Match the client
   screen's tab label/order/icon conventions for consistency.
3. **If it is client-only** (queries hardcode `client_id`, or the table has no `company_id` path): do
   NOT mount a broken tab. Leave it out and record in the report exactly what adaptation it needs
   (which query/column/table change) so it can be a follow-up. Half of parity done correctly beats a
   tab that errors or shows an individual's data on a company.
4. Preserve every existing company tab (Overview/Registers/Jobs/CoSec/Payroll/Documents/Services/Settings)
   and existing gating (e.g. Payroll's `hasPayroll`). Do not touch `ClientPortal.tsx`.

Do NOT build the "unified job+client conversation sync" here — that's a separate increment. The
Conversations tab in this task just brings the company screen to the SAME behaviour the client screen
already has (its `client_messages` thread), nothing more.

## Constraints & gate
- Reuse existing components + query keys; no parallel models; real enums/columns only (don't invent a
  `company_id` path that doesn't exist — that's what step 3 is for).
- Respect org scoping/RLS via the existing query patterns.
- Gate (use the CI config, not bare tsc): `npx tsc -p tsconfig.app.json --noEmit` → 0 errors;
  `npx vite build` succeeds, then `git checkout HEAD -- supabase/functions/mcp/index.ts` and confirm
  `git status --porcelain supabase/functions/mcp/index.ts` empty before committing. Never commit
  `mcp/index.ts`. Stage only `src/pages/CompanyDetail.tsx` (+ any component you had to adapt for
  company mode, if you did so cleanly).
