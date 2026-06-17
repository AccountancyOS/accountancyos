## Issue

For a company onboarding (Bassage Eyes Ltd), the application row has both `client_id` (the primary contact, Amy-Lee Stevens) and `company_id` (Bassage Eyes Ltd). The "View" button currently checks `client_id` first, so it navigates to the contact instead of the company.

## Fix

In `src/pages/OnboardingDetail.tsx` (lines 624-630), branch on `application_type` instead of field presence:

```ts
onClick={() => {
  if (application.application_type === "individual" && application.client_id) {
    navigate(`/clients/${application.client_id}`);
  } else if (application.company_id) {
    navigate(`/companies/${application.company_id}`);
  } else if (application.client_id) {
    navigate(`/clients/${application.client_id}`);
  }
}}
```

This guarantees company applications open the company workspace, individual applications open the client record, and the fallback still works if only one id is present.

## Verification

Open the approved Bassage Eyes Ltd onboarding application and click "View Company" — it should now land on the Bassage Eyes Ltd company page, not Amy-Lee Stevens.
