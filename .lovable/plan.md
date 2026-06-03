## Goal

Replace the hand-written `schema_json` textarea on workpaper templates with an Excel (.xlsx) file upload, so accountants can build templates in Excel (rename tabs, add formulas, etc.) and the system clones that file per job as the workpaper.

## What changes

### 1. Storage
- Create a private Supabase Storage bucket `workpaper-files` (RLS-scoped by `organization_id` in the path).
- Template path: `templates/{org_id}/{template_id}.xlsx`
- Per-job instance path: `instances/{org_id}/{job_id}/{instance_id}.xlsx`

### 2. Database (migration)
- `workpaper_templates`: add `template_format text default 'xlsx'`, `file_path text`, `file_name text`, `file_size_bytes int`, `sheet_names text[]` (cached tab list).
- `job_workpaper_instances`: add `file_path text`, `file_name text`, `last_opened_at timestamptz`, `last_uploaded_at timestamptz`, `last_uploaded_by uuid`.
- Keep existing `instance_schema_json`/`instance_data_json` columns for back-compat; new xlsx flow ignores them.
- Add an audit row on every upload via existing `bookkeeping_audit_log` pattern.

### 3. Template manager UI (`WorkpaperTemplateManager.tsx`)
Replace the "Schema JSON" textarea with:
- **Excel file upload** (drag-drop + file picker, .xlsx only, 20 MB cap).
- After upload, parse the workbook in-browser with SheetJS to extract sheet/tab names, show them as read-only chips ("Tabs: P&L, Balance Sheet, Tax Comp"), and save them to `sheet_names`.
- **Download Template** button for existing templates.
- **Replace File** button (creates a new version: bumps `version`, keeps history via existing version column).
- Remove all JSON parsing and the textarea.

### 4. Job workpaper flow
- When a job is created and an `autoCreateWorkpaperInstance` resolves a template: server-side copy the template xlsx from `templates/...` to `instances/{org_id}/{job_id}/{instance_id}.xlsx` (edge function `clone-workpaper-template`, runs with service role to do the storage copy + insert).
- Wire `CreateJobDialog` to call this after `jobs.insert` (best-effort; failure toasts but does not block job creation).
- Add a "Create Workpaper From Template" button on the Job → Workpapers tab for existing jobs that have no instance yet (template picker filtered by `job_type`).

### 5. Workpapers tab UI (Job → Workpapers)
Replace the current TB-driven rendering (kept available behind a `Open Trial Balance Workpaper` link for the existing flow) with:
- File card showing filename, sheet names, size, last updated by/at.
- **Open in Excel** (downloads the .xlsx).
- **Upload New Version** (replaces `file_path`, bumps an instance version counter, audit-logged).
- **Preview** (read-only in-browser preview of the first sheet via SheetJS, no editing — keeps scope small).
- Status pill + existing lock/review actions stay as-is and operate on the file row.

### 6. Out of scope (explicitly)
- No in-browser Excel editing (Office 365 embed / collaborative editing) in this round. Workflow is download → edit locally → upload new version.
- No automatic data population from Trial Balance into the .xlsx. The existing TB-driven `workpaper_instances` flow stays untouched for users that need it.
- No migration of existing JSON templates to xlsx — they remain editable as JSON via a fallback path only if `template_format = 'json'`.

## Technical notes

- Library: `xlsx` (SheetJS community build) for parsing sheet names client-side and rendering preview.
- Edge function `clone-workpaper-template`: takes `template_id` + `job_id`, validates org membership, does `storage.from('workpaper-files').copy(src, dst)`, inserts `job_workpaper_instances` row, returns it.
- Storage RLS: only members of the owning org can read/write paths starting with their `org_id`.
- All new columns get `GRANT`s in the same migration per project rules; new bucket policies created in the migration.

## Open question to confirm before build

Editing model — confirm one:
- **A (recommended, in this plan):** Download → edit in desktop Excel → upload new version. Simplest, no extra integrations.
- **B:** Same as A plus "Open in Excel Online" via the Microsoft Excel connector (requires per-user OAuth to OneDrive — significant extra work).

Default to A unless you say otherwise.
