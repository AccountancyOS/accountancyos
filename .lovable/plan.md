### Scope
Add a "Confirm password" field to the signup form in `src/pages/Auth.tsx` and validate that both password entries match before submitting.

### Changes

1. **Add state** for `signupConfirmPassword` alongside existing `confirmPassword` (which is used for the reset-password flow).

2. **Add input field** in the signup `TabsContent` (below the Password field):
   - Label: "Confirm password"
   - `type="password"`
   - `autoComplete="new-password"`
   - `required`
   - `minLength={6}`

3. **Add validation** in `handleSignUp` (before calling `supabase.auth.signUp`):
   - If `password !== signupConfirmPassword`, show a toast error: "Passwords don't match. Please make sure both passwords are the same."
   - Return early without submitting.

4. **Reset** `signupConfirmPassword` on successful signup or when switching tabs.

### Files changed
- `src/pages/Auth.tsx` only.