

# Document Storage Architecture — Root Cause Analysis and Production Fix

---

## 1. Root Cause

The `job_documents` table and `document-service.ts` reference a storage bucket called `job-documents` that was never created. There are also storage policies referencing a `client-documents` bucket that also does not exist. Neither bucket was ever created via migration.

This is not a simple missing-bucket problem. It is an architectural gap: the document storage layer was designed at the metadata level (DB tables, RLS policies, service code) but the physical storage layer was never instantiated.

---

## 2. Current State Audit

### A. Storage Buckets (what exists)

| Bucket | Purpose | Has Policies |
|--------|---------|-------------|
| `branding` | Org logos/branding | Yes, org-scoped |
| `filing-documents` | Filing attachments | Yes, org-scoped |
| `onboarding-documents` | Client onboarding docs | Yes, org-scoped |
| `questionnaire-files` | Questionnaire uploads | Yes, org-scoped |
| `receipts` | Bookkeeping receipts | Yes, org-scoped |
| `job-documents` | **MISSING** — referenced by code | No bucket exists |
| `client-documents` | **MISSING** — referenced by policies | No bucket exists |

### B. Code referencing `job-documents` bucket

| File | Usage |
|------|-------|
| `src/lib/document-service.ts` | Upload, download (signed URL), delete |
| `src/components/workpaper/WorkpaperDocumentPanel.tsx` | Direct `.download()` |
| `src/components/client-portal/ClientDocumentsTab.tsx` | Uses `document-service.ts` |
| `src/components/jobs/JobDocumentsTab.tsx` | DB query only (no storage call yet) |

### C. Metadata Tables

- **`job_documents`** — canonical table for job-scoped documents. Has `organization_id`, `job_id`, `client_visible`, `signature_required`, `signed_at/by`, `version`, `archived`, etc. **RLS is correct**: org-scoped for accountants, portal-scoped for clients.
- **`filing_documents`** — filing-specific, uses `filing-documents` bucket. Separate concern.
- **`onboarding_documents`** — onboarding-specific, uses `onboarding-documents` bucket. Separate concern.
- **`job_artifacts`** — unified artifact registry (references documents, questionnaires, workpapers). Has `source_document_id` FK.

### D. Path Convention

`document-service.ts` generates: `{org_id}/{job_id}/{timestamp}_{sanitized_filename}`. This is correct and consistent with every other bucket's convention (org_id as first path segment for RLS enforcement).

### E. Existing Data Risk

Zero rows in `job_documents`. No orphaned storage objects. No backfill needed.

### F. The `client-documents` bucket question

Storage policies exist for a `client-documents` bucket that does not exist either. However, the actual code for client documents (`ClientDocumentsTab.tsx`) reads from the `job_documents` **table** and downloads from the `job-documents` **bucket**. The `client-documents` policies are orphaned remnants from an earlier migration. They should be removed.

---

## 3. Target Architecture

### Decision: Single canonical bucket for job documents

**One bucket: `job-documents`**. Rationale:
- All job-related documents (accountant uploads, client uploads, questionnaire outputs, signature documents) are already tracked in a single `job_documents` table
- The path convention `{org_id}/{job_id}/{timestamp}_{filename}` already provides the necessary hierarchy
- Visibility (client-visible vs internal) is a metadata attribute, not a bucket separation concern
- Filing documents remain in `filing-documents` (different lifecycle, different table)
- Onboarding documents remain in `onboarding-documents` (different lifecycle)

### Path Convention (confirmed)

```text
{org_id}/{job_id}/{timestamp}_{sanitized_filename}
```

- First segment = org_id (enforced by storage RLS)
- Second segment = job_id (enables per-job listing)
- Timestamp prefix prevents collisions

### Visibility Model

All handled via `job_documents` table columns (already exist):

| Column | Purpose |
|--------|---------|
| `client_visible` | Whether client portal users can see this document |
| `signature_required` | Whether document needs client signature |
| `signed_at` / `signed_by` / `signature_ip` / `signature_typed_name` / `scroll_verified` | Signature audit trail |
| `version` | Incremented on signature events |
| `archived` / `archived_at` | Soft archive (7-year retention) |
| `uploaded_by` | Who uploaded |
| `uploaded_at` | When uploaded |

No hard deletes of signed documents — code must check `signed_at IS NOT NULL` before allowing delete.

### Audit and Retention

- `uploaded_by` + `uploaded_at` tracks creation
- Signature metadata is immutable once captured (existing `createSignedDocumentVersion` increments version)
- `archived` for soft archive; `auto_archive_at` for 7-year compliance
- Deletes of signed documents must be blocked in code (and ideally via trigger)

---

## 4. Implementation Plan

### A. Migration SQL

1. **Create the `job-documents` bucket** (private, 20MB limit)
2. **Add org-scoped storage policies** — INSERT, SELECT, DELETE — all scoped to org membership via `organization_users` table check on `storage.foldername(name)[1]`
3. **Add UPDATE policy** for the bucket (document-service uses `upsert: false`, but workpaper panel or future flows may need it)
4. **Add a trigger on `job_documents`** to block deletion of signed documents (`signed_at IS NOT NULL`)
5. **Drop orphaned `client-documents` storage policies** that reference the non-existent bucket
6. No portal-specific storage policies needed — portal users access documents via signed URLs generated by the `document-service.ts` (which uses `createSignedUrl`, not direct storage access)

### B. Code Changes

1. **`src/components/jobs/JobDocumentsTab.tsx`** — Wire up the Upload button to use `document-service.ts` `uploadJobDocument()` with a file input, and wire the Download button to use `downloadDocument()`
2. **`src/components/workpaper/WorkpaperDocumentPanel.tsx`** — Replace direct `supabase.storage.from("job-documents").download()` with `downloadDocument()` from `document-service.ts` for consistency and error handling
3. **`src/lib/document-service.ts`** — Add a guard in `deleteJobDocument()` to check `signed_at` before allowing deletion
4. **`src/components/client-portal/ClientDocumentsTab.tsx`** — Add signed-document deletion guard (check `signed_at` before calling delete mutation)

### C. Backfill / Repair

None required. Zero existing rows in `job_documents`. Zero objects in the bucket.

### D. Security Impact

- Storage access is org-scoped via `organization_users` membership check on the first path segment
- Portal clients do not directly access storage — they go through signed URLs generated server-side
- `job_documents` table RLS already correctly uses `user_has_organization_access(organization_id)` for accountants and `client_has_portal_access` for portal users
- Signed documents cannot be deleted (new trigger)

### E. Regression Checklist

- Accountant can upload a document from the Job Documents tab
- Accountant can upload a document from the Client Documents tab
- Accountant can download any document in their org
- Accountant from a different org cannot access documents
- Portal client can see only `client_visible = true` documents
- Portal client cannot see `client_visible = false` documents
- Signature flow works (scroll-to-sign, version increment)
- Signed documents cannot be deleted
- Workpaper document panel download works
- Existing filing-documents, onboarding-documents, questionnaire-files buckets unaffected
- Orphaned client-documents policies removed without side effects

### F. Test Plan

| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | Accountant uploads internal-only document to job | Upload succeeds, `client_visible = false`, file in `job-documents/{org_id}/{job_id}/...` |
| 2 | Accountant uploads client-visible document | Upload succeeds, `client_visible = true` |
| 3 | Accountant uploads signature-required document | Upload succeeds, `signature_required = true` |
| 4 | Portal client views documents for their entity | Only sees `client_visible = true` documents |
| 5 | User from different org tries to access storage | Blocked by storage RLS |
| 6 | Accountant deletes unsigned document | Succeeds |
| 7 | Accountant attempts to delete signed document | Blocked by trigger + code guard |
| 8 | Client signs document via scroll-to-sign flow | Version incremented, signature metadata recorded |
| 9 | Download from workpaper panel | Works correctly |
| 10 | Download from job documents tab | Works correctly |

---

## Technical Details

### Storage policies pattern (matching existing conventions)

All existing buckets use the same pattern: check `organization_users` where `organization_id::text = storage.foldername(objects.name)[1]`. The `job-documents` policies will follow this exact pattern.

### Files to modify

- `src/components/jobs/JobDocumentsTab.tsx` — add upload/download wiring
- `src/components/workpaper/WorkpaperDocumentPanel.tsx` — use `document-service.ts`
- `src/lib/document-service.ts` — add signed-document delete guard
- `src/components/client-portal/ClientDocumentsTab.tsx` — add signed-document delete guard
- 1 new migration for bucket creation, policies, trigger, and orphaned policy cleanup

