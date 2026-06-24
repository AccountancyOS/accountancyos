## Problem

The AML panel renders two separate sections:

1. **Uploaded Documents** — two status rows ("ID Document" / "Proof of Address") with a green "Uploaded" badge but no download affordance.
2. **Available documents** — a duplicate flat list of the same files with download icons, using raw file names ("IMG_2570.png", "Self Assessment Checklist…pdf") that hide which slot they belong to.

The `onboarding_documents.document_type` field is exactly `id` or `proof_of_address`, so each file maps cleanly to one of the two status rows.

## Fix

In `src/components/onboarding/AMLVerificationPanel.tsx`:

1. Build a lookup at the top of the render: `byType = { id: doc?, proof_of_address: doc? }` from the `documents` prop.
2. In each status row (ID Document, Proof of Address), when the slot is uploaded and a matching doc exists, render an icon-only download button to the right of the "Uploaded" badge, wired to `downloadDocument(doc.storagePath, doc.name)`. Use the file name as `title`/`aria-label` so it's still discoverable on hover.
3. Delete the entire "Available documents:" block (lines ~217–236), including its `{documents.length > 0 && …}` guard.

No backend changes, no prop changes. Only `AMLVerificationPanel.tsx` is touched.
