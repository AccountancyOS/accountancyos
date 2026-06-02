## Audit findings (verified against DB and code)

**Templates table (`public.templates`)**
- 14 system templates already exist (`organization_id IS NULL`) with non-empty `subject`, `body`, `htmlBody`, `category`: Quote Proposal, CRM Follow-Up, Deadline Approaching, Engagement Letter Reminder, HMRC Authorisation Reminder, Invoice Payment Reminder, KYC Document Reminder, Message Follow-Up, New Service Welcome, Onboarding Reminder, Questionnaire Reminder, Records Request Reminder, Signature Request Reminder, Workpaper Review Reminder.
- RLS: SELECT allowed when `organization_id IS NULL` OR caller belongs to that org. INSERT/UPDATE/DELETE restricted to org members. Correct.
- No per-practice clones exist yet. Practices only get a row when they explicitly clone via the UI.

**Templates page (`src/pages/Templates.tsx`)**
- Lists both system and org-owned rows. Clicking a system card or the "Clone & Customise" button routes to `/templates/new?clone_from=<id>`.

**Detail page (`src/pages/TemplateDetail.tsx`)**
- `cloneSource` query fetches the system row and a `useEffect` pushes its content into local `content` state. Works correctly.
- Two cosmetic bugs to fix while here: `setStatus("draft")` violates the status check constraint (must be `inactive`/`active`), and on save it would 23514. Use `"inactive"`.

**Editor (`src/components/templates/EmailTemplateEditor.tsx`) — the real UI bug**
```ts
const [subject, setSubject]   = useState(content.subject  || "");
const [body, setBody]         = useState(content.body     || "");
const [htmlBody, setHtmlBody] = useState(content.htmlBody || "");
const [category, setCategory] = useState(content.category || "");
```
`useState` initialises once. Editor mounts with empty `content` from the parent's initial render, then ignores the cloned payload when it arrives. Inputs stay blank — exactly what is on screen.

**Merge fields**
- `template_merge_fields` has 33 rows in real dot-notation (`{{client.first_name}}`, `{{organization.name}}`, `{{filing.period_end}}`, `{{deadline.filing_date}}`, etc.) plus 8 quote-scoped tokens (`{{accept_link}}`, `{{quote_total}}`…).
- The runtime resolver (`src/lib/placeholder-resolver.ts` + `workflow-step-executor.ts`) supports the dot-notation keys.
- The spec proposes underscore-style tokens (`{{practice_name}}`, `{{client_first_name}}`, `{{quote_acceptance_link}}`, `{{records_request_link}}`, `{{questionnaire_link}}`, `{{approval_link}}`, `{{client_portal_link}}`, `{{payment_*}}`, `{{filing_name}}`, `{{submission_*}}`). Most do **not** exist in the resolver. We will standardise seeded templates on the **existing dot-notation** and only add new resolver tokens for the genuinely missing concepts (links, payment, submission).

## What we will build

### Part 1 — Editor bug (real, separate from seeding)

`src/components/templates/EmailTemplateEditor.tsx`:
- Delete the four `useState` hooks for `subject` / `body` / `htmlBody` / `category`.
- Derive each value from the `content` prop: `const subject = content.subject ?? ""` etc.
- Replace setters with a single `update(field, value)` that calls `onChange({ ...content, [field]: value })`.
- Update `insertMergeField` and `insertQuestionnaireLink` (they already operate on whichever field is "active") to use `update(...)`.
- Leave the merge-field panel, the rich/HTML toggle, and the Quote-scoped filter untouched.

`src/pages/TemplateDetail.tsx`:
- Change the clone effect's `setStatus("draft")` to `setStatus("inactive")` so cloned rows save without violating the check constraint.

### Part 2 — Expand the system library and resolver

**Resolver additions (`src/lib/placeholder-resolver.ts`, `workflow-step-executor.ts`, `supabase/functions/workflow-tick/index.ts`):** add resolvers for the link/payment/submission concepts that the seeded templates reference but the engine does not yet support:
- `{{client.portal_link}}`
- `{{quote.accept_link}}` (alias of existing `{{accept_link}}` outside the quote-only scope)
- `{{engagement.sign_link}}`
- `{{records_request.link}}`
- `{{questionnaire.link}}`
- `{{approval.link}}`
- `{{payment.name}}`, `{{payment.amount}}`, `{{payment.due_date}}`
- `{{filing.name}}`, `{{filing.submission_reference}}`, `{{filing.submission_date}}`
- `{{organization.email}}`, `{{organization.phone}}`

Mirror each new key as a row in `template_merge_fields` (data insert, not schema change) so the editor's merge-field panel exposes them, scoped via `template_types` where relevant.

**System template upserts (data insert, idempotent by stable `id`):** keep the 14 existing rows where the content already passes review and upsert the missing categories from the spec so the library covers every workflow the spec lists. Final library, all `organization_id IS NULL`, all with `subject` + plain `body` + `htmlBody` + `category`:

| Category | Templates |
|---|---|
| Quotes | Quote Proposal (existing), Quote Reminder, Quote Final Reminder |
| Onboarding | Welcome / Onboarding Started, Engagement Letter Ready, Engagement Letter Reminder (existing), HMRC Authorisation Reminder (existing), KYC Document Reminder (existing), New Service Welcome (existing), Onboarding Reminder (existing), Signature Request Reminder (existing) |
| Records | Records Request, Records Request Reminder (existing), Records Request Final Reminder |
| Questionnaires | Questionnaire Sent, Questionnaire Reminder (existing) |
| Deadlines | Deadline Approaching (existing), Payment Reminder |
| Workflows | Workpaper Review Reminder (existing), Approval Required, Filing Submitted, Job Completed |
| CRM | CRM Follow-Up (existing), Message Follow-Up (existing) |
| Billing | Invoice Payment Reminder (existing) |

Each template body uses the dot-notation tokens listed above and the existing professional/Title-Case house style (no emojis, no exclamations, Arial-15 / teal CTA HTML matching Quote Proposal). Stable IDs in the `00000000-0000-0000-0000-0000000000bXX` range so re-running the seed never duplicates.

Every seeded row also gets a stable `tags` entry `["system_default","<slug>"]` so the backfill (Part 3) can match by slug rather than UUID.

### Part 3 — Backfill for every existing practice + new-signup parity

**No new table.** Practice copies live in the existing `templates` table, identified by:
- a `source_template_id uuid` column pointing back to the system row, and
- a unique index `(organization_id, source_template_id) where source_template_id is not null` to prevent duplicate clones.

Schema migration:
1. `alter table public.templates add column if not exists source_template_id uuid references public.templates(id) on delete set null;`
2. Partial unique index above.
3. No GRANT changes needed (covered by existing grants).

Backfill function (security definer, idempotent):
- `public.ensure_default_templates_for_org(_org_id uuid)` loops over every system template (`organization_id IS NULL`) and `INSERT … ON CONFLICT (organization_id, source_template_id) DO NOTHING` a `status='inactive'` copy with the same name/description/type/service/content/tags. Practice-edited rows are never touched because we only insert when no row with that `source_template_id` exists.

Wiring:
- Call `ensure_default_templates_for_org(NEW.id)` from the existing `handle_new_organization` trigger / `create_organization` SECURITY DEFINER function (whichever already runs on org creation — verified in the org-creation memory).
- One-shot backfill at the bottom of the migration: `select public.ensure_default_templates_for_org(id) from public.organizations;`

Safety:
- Function is `security definer`, `search_path = public`.
- Re-running the migration or calling the function repeatedly is a no-op on practices that already have copies.
- Practice edits are preserved because we never `UPDATE` existing rows.

### Part 4 — UI distinction (minimal, no redesign)

`Templates.tsx`: the System badge already exists. Add one filter chip "Library" that defaults to showing the practice's own copies (`organization_id = currentOrg`) and a toggle to also reveal system originals. The current "Clone & Customise" affordance stays for any practice that wants a fresh fork.

No changes to category navigation, sidebar, or routing.

### Part 5 — Automation linkage

No code changes required to the chaser/automation engine: it already references templates by ID via `templates_id` on chaser policies. Once Part 3 runs, every practice has a complete set of clonable rows whose IDs can be selected in existing automation pickers.

Fix the misleading stop-condition copy in **two** places only (verified by grep earlier in the loop): the chaser-policy default labels in `src/lib/chaser-policy-service.ts` that currently read "ceases when records received" for non-records workflows. Use the deadline/job/filing/task completion language from the spec.

## Acceptance verification

1. Existing practice → `/templates` shows the full library with non-empty subject/body/HTML/category before any clicking.
2. New practice (sign up Greenfield-style test user) → `/templates` already populated.
3. Opening any system or practice template renders subject, category, plain body, HTML body. Insert merge field still works. Save persists.
4. Re-running the migration adds zero rows and changes zero edited rows (verify with `select count(*) from templates`).
5. Chaser pickers list the seeded templates by name.
6. Records reminders' stop language references job/task completion; deadline reminders' stop language references deadline/filing/task completion.

## Files touched

- `src/components/templates/EmailTemplateEditor.tsx` — remove local state, derive from `content`.
- `src/pages/TemplateDetail.tsx` — use `"inactive"` not `"draft"` on clone.
- `src/pages/Templates.tsx` — add the Library/System filter chip.
- `src/lib/placeholder-resolver.ts`, `src/lib/workflow-step-executor.ts`, `supabase/functions/workflow-tick/index.ts` — add the new dot-notation resolvers.
- `src/lib/chaser-policy-service.ts` — correct stop-condition labels.
- New schema migration — `source_template_id` column, unique index, `ensure_default_templates_for_org` function, hook into org-creation trigger, one-shot backfill.
- New data insert — upsert system templates and new merge-field rows (idempotent by stable IDs).
- Edge function redeploy after `workflow-tick` change.

Out of scope (confirm if you want them in): redesigning the Templates list page, building a separate System Library page, adding per-template version history beyond the existing `version_number` column.
