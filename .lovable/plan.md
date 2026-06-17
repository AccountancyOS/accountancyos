## Issue

After an engagement letter is signed and AML is approved, the onboarding screen shows a "View Company" button. Clicking it navigates to `/clients/company/{company_id}`, which is not a registered route — so React Router falls through to the 404 page.

The correct company route in `src/App.tsx` is `/companies/:companyId`.

## Fix

In `src/pages/OnboardingDetail.tsx` (around line 628), change the company branch of the button's `onClick` from:

```ts
navigate(`/clients/company/${application.company_id}`);
```

to:

```ts
navigate(`/companies/${application.company_id}`);
```

The individual branch (`/clients/:clientId`) stays unchanged — that route exists and works.

## Verification

Re-open the approved onboarding application, click "View Company", and confirm it lands on the company workspace instead of the 404 page.
