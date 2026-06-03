## Onboarding Review Page Cleanup (Accountant view)

Trim, fix, and tidy `OnboardingDetail` so it shows a clean, accurate review of what the client submitted.

### 1. Commercial Snapshot — show real services and prices

`accepted_snapshot.lines` stores `service_id`, `unit_price`, `subtotal`, `quantity`, `billing_frequency` — there's no `description`/`service_name`/`amount` field, which is why the current UI prints blank names and £0.

Fix in `src/pages/OnboardingDetail.tsx`:
- After loading the quote, fetch `services` (`id, name, billing_frequency`) for every `service_id` in `snapshot.lines` and map id → name.
- Render each line as: service name (fallback to "Service"), badge for `billing_frequency` (Monthly / Quarterly / Annual / One-off), and the row amount = `line.subtotal ?? line.unit_price * line.quantity`.
- Hide the "qty 1" suffix when quantity is 1; only show "× N" when >1.
- Total: prefer `snapshot.totals.subtotal`, fall back to `application.quote.total_amount`.

### 2. Remove the standalone Onboarding Questionnaire card

The unified onboarding flow already covers questionnaire + engagement + AML, so the separate "Send Onboarding Questionnaire" card on this page is legacy/confusing.

- Delete the `<OnboardingQuestionnaireSection ... />` block (and its import) from `OnboardingDetail.tsx`.
- Leave the component file in place for now (other surfaces may reference it); only remove its use from the review page.

### 3. Engagement Letter card — add a real preview

Today the card only shows sent/signed timestamps in a tall, mostly-empty card.

- In `EngagementLetterSection.tsx`, when a letter row exists add a **View Letter** button that opens `/engagement/{signature_token}` in a new tab (the existing `EngagementLetterPreview` route already renders the full letter with the signed snapshot).
- Tighten the card: drop the empty padding when status is `signed` so it sits at the same height as the AML Verification card next to it.
- Keep the "Resend" action for unsigned letters.

### 4. Remove the Professional Clearance section

The onboarding flow never asks the client for a previous-accountant; surfacing it here is misleading.

- Remove `<ProfessionalClearanceSection .../>` and its import from `OnboardingDetail.tsx`. (Component file stays — no schema changes.)

### 5. Remove the "Approval Requirements" box

Redundant with the top "For Review" banner (which already gates the Approve button on the engagement letter and warns on AML).

- Delete the entire "Approval Requirements" `<Card>` (and its surrounding `<div className="grid ...">` wrapper if it becomes empty) from `OnboardingDetail.tsx`.

### 6. Remove the accountant-side AML upload card and route client-uploaded AML docs into the client portal

The bottom **AML Documents** card lets the accountant upload AML files, which is wrong — only the client should upload via the onboarding wizard.

Frontend (`OnboardingDetail.tsx`):
- Delete the entire "AML Documents" upload `<Card>` (the three file inputs + uploaded files list).
- Also remove the now-unused `handleFileUpload`, `uploading` state, and the `Input`/`Label`/file-upload imports it required. (The AMLVerificationPanel keeps showing the uploaded docs with download buttons — that's the right place.)

Backend — make client AML docs visible in the Client Portal Documents tab:

- New migration: add `client_id uuid` and `company_id uuid` (nullable, FK on delete set null) plus an index on each to `onboarding_documents`. RLS already scopes by organization; no new policies needed beyond keeping the existing org-scoped ones.
- Update `lifecycle_approve_onboarding` to backfill those columns on every `onboarding_documents` row for the approved application using the newly-created `v_client_id` / `v_company_id`.
- Extend `ClientDocumentsTab.tsx` (and its company-mode equivalent path) to also query `onboarding_documents` filtered by `client_id` / `company_id`, normalise them into the existing `JobDocument` shape (source label "Onboarding / AML"), and render them in the same list. Download uses the existing `documents` bucket helper but pointed at the `onboarding-documents` bucket — reuse the same signed-URL pattern already added to `AMLVerificationPanel`.
- No copy/duplication of files: portal reads straight from `onboarding_documents` + `onboarding-documents` bucket, so there's a single source of truth and no risk of drift.

### Verification

For Churchills London (or any onboarding with an accepted quote and uploaded AML docs):
1. Open the onboarding detail page.
2. Confirm: Commercial Snapshot lists each service by name with the correct monthly amount and a total matching the accepted quote; no Questionnaire/Clearance/Approval-Requirements/AML-upload cards remain; Engagement Letter card has a working **View Letter** link.
3. Approve the application.
4. Open the resulting client (or company) in the Client Portal Documents tab and confirm the ID document and proof of address uploaded during onboarding are listed there with working download.
