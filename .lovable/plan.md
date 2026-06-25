## Goal

In the AML Verification panel, replace the two static "ID Document / Proof of Address" rows AND the separate "Available documents" file list with a single **Uploaded Documents** section that shows each real uploaded file inline with its download icon.

## Why

Today the panel renders two parallel blocks:
- A static "Uploaded Documents" block keyed by document_type (id, proof_of_address), which only shows the Uploaded badge when types match.
- A fallback "Available documents" list of raw filenames with download icons (rendered when type matching fails, e.g. types stored as "identity" or other strings).

This causes the duplication in the screenshot and wastes vertical space.

## Change

File: `src/components/onboarding/AMLVerificationPanel.tsx`

Under the existing **Uploaded Documents** heading:

1. Remove the two hard-coded rows (ID Document, Proof of Address) and remove the "Available documents" fallback block entirely.
2. Render one row per item in the `documents` prop:
   - File icon
   - `file_name` as the label
   - Small muted sub-label mapping `document_type` to a friendly name (`id` → "ID Document", `proof_of_address` → "Proof of Address", anything else → the raw type Title-Cased)
   - Green "Uploaded" badge
   - Download icon button (existing `downloadDocument` handler)
3. If `documents` is empty, show the existing "Not Uploaded" empty-state badges for ID and Proof of Address so the verifier still sees what's missing.
4. Keep the verification checklist logic exactly as is — it already keys off `idDocumentUploaded` / `proofOfAddressUploaded` booleans, not the rendered list.

No backend, RPC, or other component changes.

## Out of scope

- Changing how `document_type` is stored.
- Any other onboarding sections (Engagement Letter, Commercial Snapshot, etc.).
