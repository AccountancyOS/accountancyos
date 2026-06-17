## Add Forgot Password to the Client Portal

### New pages (public, under `/portal/*`)
1. `src/portal/pages/PortalForgotPassword.tsx`
   - Email input + submit → `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${window.location.origin}/portal/reset-password })`
   - Always shows a generic success toast ("If an account exists, a reset link has been sent") to avoid email enumeration
   - "Back to sign in" link to `/portal/login`
2. `src/portal/pages/PortalResetPassword.tsx`
   - Listens for `PASSWORD_RECOVERY` auth event and parses `type=recovery` from `window.location.hash`
   - New password + confirm fields → `supabase.auth.updateUser({ password })`
   - On success: toast and redirect to `/portal/dashboard` (user is now signed in via the recovery session)
   - If no recovery session present, show "Reset link expired" with a link back to `/portal/forgot-password`

### Wiring
- `src/portal/pages/PortalLogin.tsx`: add a "Forgot password?" link directly under the password field linking to `/portal/forgot-password`. Replace the existing "Trouble signing in? Contact your accountant." footnote with the link + sign-in helper.
- `src/portal/routes/PortalRoutes.tsx`: register two new public routes alongside `login` and `invite`:
  - `<Route path="forgot-password" element={<PortalForgotPassword />} />`
  - `<Route path="reset-password" element={<PortalResetPassword />} />`
- `src/App.tsx` already routes `/portal/*` to `PortalRoutes`, so no change there. The portal `ProtectedRoute` redirect that sends non-portal accountant pages to `/portal` does not affect these routes (they live under `/portal/*`).

### Styling
Match the existing `PortalLogin` Card layout (same `Card`, `CardHeader`, `Input`, `Button`, `bg-background` shell) so the three pages feel consistent.

### Verification
1. From `/portal/login`, click "Forgot password?" → land on `/portal/forgot-password`, enter the portal-b email, submit, see success toast.
2. Receive the email, click the recovery link → land on `/portal/reset-password` with the new-password form (not redirected to accountant app).
3. Set a new password → land on `/portal/dashboard` signed in.
4. Sign out and sign back in with the new password.

No database, RLS, or edge-function changes are needed — Supabase Auth handles the recovery email via its existing template, and Lovable Cloud already ships a default recovery email.
