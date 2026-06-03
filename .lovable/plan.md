Fix the inconsistent CTA button labels on the onboarding review page.

## Issue
The top action bar button says "Approve & Activate" while the bottom action card button says "Approve & Create Client". Both should read "Approve & Create Client".

## Change
Update `src/pages/OnboardingDetail.tsx` line 342: change `Approve & Activate` to `Approve & Create Client`.

No other changes required.