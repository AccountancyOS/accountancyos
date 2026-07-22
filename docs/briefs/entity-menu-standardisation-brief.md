# Standardise the entity workspace menu (client + company screens)

**Goal (owner spec):** every entity — individual (`/clients/:id` → `ClientPortal.tsx`) and company
(`/companies/:id` → `CompanyDetail.tsx`) — shows the SAME core menu, in this order:

**Overview · Conversations · Jobs · Documents · Contacts · Questionnaires · Workpapers · Services · Settings**

with these merges vs today:
- **Emails folds into Conversations** — `ConversationsTab` already merges `client_messages`
  (internal + external) AND `email_messages` into one timeline, so remove the standalone **Emails**
  tab from both screens. (Do NOT delete the `EmailList` component; just drop the tab.)
- **Deadlines moves into Overview** — remove the standalone **Deadlines** tab from both screens; the
  Overview must show a deadlines summary (see below).
- **Billing tab removed** — it is only an empty "coming soon" placeholder today, so removing it loses
  nothing. (A separate follow-up will add billing-per-service to the Services tab — NOT this task.)
- The client screen's first tab **"Portal" is renamed "Overview"** (its component `ClientPortalTab`
  stays, just relabelled + given the deadlines summary).

**Company-specific extras stay** (companies only, in addition to the standard menu): Registers,
CoSec Jobs, Payroll (keep the existing `hasPayroll` gate). Place them sensibly (e.g. Registers +
CoSec Jobs right after Jobs; Payroll near Services) without breaking the standard order/labels.

## Component adaptations required (from docs/.superpowers/sdd/company-parity-report.md)
Three tab components currently hardcode `client_id`, so companies can't use them. All three tables
(`questionnaire_instances`, `workpaper_instances`, `deadlines`) already have a `company_id` column —
this is component-only, no migration. Adapt each to accept `{ clientId?, companyId? }` and filter on
whichever is provided (mirror how `ConversationsTab`/`EmailList`/`ContactsList` already do it):
- `ClientQuestionnairesTab` (+ `SendQuestionnaireDialog` if it inserts `client_id`).
- `ClientWorkpapersTab`.
- `ClientDeadlinesTab` — needed for the Overview deadlines summary in company mode.

## Overview deadlines summary
- Client Overview (`ClientPortalTab`): add a compact upcoming-deadlines summary (reuse the
  `ClientDeadlinesTab` data/query for the client). Keep it a summary, not the full tab.
- Company Overview: `CompanyProfilePanel` already renders a deadlines strip — if it's sufficient,
  leave it; otherwise add the same compact summary. Don't duplicate a deadlines strip twice.

## Do / Don't
- Reuse existing components + query keys; adapt (don't fork) the three client-only components.
- Real columns/enums only; respect org scoping/RLS via existing patterns.
- Don't build the Services-billing display here (separate follow-up). Don't build the job↔client
  conversation "sync" here. Don't touch job-workspace files.
- Both screens must end with the identical standard tab set/order; companies additionally show their
  extras.

## Gate (CI config — a bare `npx tsc --noEmit` misses errors)
- `npx tsc -p tsconfig.app.json --noEmit` → 0 errors.
- `npx vite build` → succeeds, then `git checkout HEAD -- supabase/functions/mcp/index.ts` and confirm
  `git status --porcelain supabase/functions/mcp/index.ts` empty before committing. Never commit
  `mcp/index.ts`.
- Stage only: `ClientPortal.tsx`, `CompanyDetail.tsx`, and the three adapted components (+ `ClientPortalTab`
  and `SendQuestionnaireDialog` if touched).
