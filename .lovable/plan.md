## Problem

On the onboarding detail page, the AML Verification panel's download button fails with "download could not be completed".

Root cause: client AML files are uploaded into the `onboarding-documents` storage bucket (see `OnboardingDetail.handleFileUpload`), but `AMLVerificationPanel.downloadDocument` calls `supabase.storage.from("documents")` — a bucket that does not exist. Every download therefore errors out.

## Fix

Single-line change in `src/components/onboarding/AMLVerificationPanel.tsx`:

- In `downloadDocument`, change `.from("documents")` to `.from("onboarding-documents")` so the signed download targets the same private bucket the files were uploaded to.

No schema, RLS, or upload-side changes are needed — the bucket already exists and is private, and the staff user opening this panel is authenticated against the same org that owns the file path.

## Verification

After the change, on the Churchills London onboarding (or any application with uploaded AML docs):
1. Open the onboarding detail page.
2. In the AML Verification panel, click the download icon next to each uploaded document.
3. Confirm the file downloads with its original filename and no toast error.
