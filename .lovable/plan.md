## Make System Templates Visible in the Library

**Problem:** The seeded "Quote Proposal" email template exists (`organization_id IS NULL`) but the Templates page filters strictly by `organization_id = current org`, so it never appears. Accountants have no way to view or customise it.

**Audit:** Only one system-level template exists today (`Quote Proposal`). This fix is generic, so any future seeded system templates will automatically appear too.

### Changes

**1. `src/pages/Templates.tsx`**
- Update query to fetch rows where `organization_id = current org` **OR** `organization_id IS NULL`.
- Add a "System" badge (alongside the existing Active/Inactive chip) on rows with `organization_id = null`.
- On click of a system row, route to `/templates/new?clone_from=<id>` instead of the read-only detail view.
- Add a `Clone & Customise` action button on system template cards for discoverability.

**2. `src/pages/TemplateDetail.tsx` (new-template route)**
- When the `clone_from` query param is present, fetch the source template and prefill: `name` (suffix " (Custom)"), `subject`, `body`, `type`, `service`, merge-field metadata, description.
- Save creates a new row scoped to the current `organization_id` with `status = 'draft'`.

**3. Resolution logic — no change needed**
- `lifecycle_send_quote` already prefers org-scoped templates matching `service = 'quote_proposal'` and falls back to the system row. Once the practice activates their clone, it automatically wins.

**4. No database migration** — the template row already exists.

### Out of scope
- Auto-cloning every system template into every org on signup (rejected: keeps the library uncluttered; opt-in via clone).
- Adding a dedicated "Quote" filter chip — the existing All Types dropdown handles `email` already.
