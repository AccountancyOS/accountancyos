## Problem
The public onboarding screens (header "Welcome to …" and the final success card "Thank you. Your onboarding has been submitted to …") show the organization's legal/account name rather than the Trading Name configured in Practice Details → Branding.

Root cause: `public.public_get_onboarding` returns `organization.name` directly from `organizations.name`, ignoring `organization_branding.trading_name`. The frontend (`src/pages/PublicOnboarding.tsx`) faithfully renders whatever the RPC returns.

## Fix
Single database migration. No frontend changes.

Update `public.public_get_onboarding(p_application_id uuid)` so the returned `organization.name` resolves to:

```
COALESCE(NULLIF(ob.trading_name,''), NULLIF(ob.legal_name,''), o.name)
```

by joining `organization_branding ob` on `organization_id = o.id`. This matches the same precedence already used by other RPCs (e.g. the snapshot helpers in earlier migrations) and by `WelcomeDashboard.tsx`, so the Trading Name flows through consistently to every onboarding surface (welcome header, engagement step's "Practice:" line, billing step, and the final "submitted to {practice}" success message).

## Verification
After the migration runs:
1. Call `public_get_onboarding` for the Churchills London application and confirm `organization.name` equals Greenfield & Co's Trading Name from Practice Details.
2. Reload the public onboarding URL and confirm the heading, engagement summary, and DoneCard all show the Trading Name.