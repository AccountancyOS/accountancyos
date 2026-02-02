

# Password Reset Flow Fix

## Problem Summary

The password reset flow is broken because:

1. **No recovery state tracking**: The auth context doesn't distinguish between normal authentication and password recovery mode
2. **Premature redirect**: `PublicRoute` redirects all authenticated users, including those in recovery mode, preventing them from setting a new password
3. **Missing UI**: `Auth.tsx` has no form for entering a new password and doesn't listen for the `PASSWORD_RECOVERY` event

## Architecture Overview

```text
Current Flow (Broken):
┌─────────────────────────────────────────────────────────────────┐
│ User clicks email link                                          │
│      ↓                                                          │
│ /auth?reset=true#access_token=...&type=recovery                 │
│      ↓                                                          │
│ Supabase auto-authenticates from hash tokens                    │
│      ↓                                                          │
│ PublicRoute sees user → Redirects to /                          │
│      ↓                                                          │
│ Recovery token consumed, user can't reset password              │
└─────────────────────────────────────────────────────────────────┘

Fixed Flow:
┌─────────────────────────────────────────────────────────────────┐
│ User clicks email link                                          │
│      ↓                                                          │
│ /auth?reset=true#access_token=...&type=recovery                 │
│      ↓                                                          │
│ Auth.tsx detects PASSWORD_RECOVERY event                        │
│      ↓                                                          │
│ Sets authFlow = "recovery" in context                           │
│      ↓                                                          │
│ PublicRoute sees authFlow = "recovery" → Allows access          │
│      ↓                                                          │
│ User sees "Set New Password" form                               │
│      ↓                                                          │
│ User submits → supabase.auth.updateUser({ password })           │
│      ↓                                                          │
│ Sign out, clear URL, show sign-in form                          │
└─────────────────────────────────────────────────────────────────┘
```

## Technical Implementation

### File 1: `src/lib/auth-context.tsx`

**Changes:**
- Add `authFlow: "normal" | "recovery"` state
- Add `setAuthFlow` function to allow Auth.tsx to update flow state
- Expose `authFlow` in context value

| New State | Type | Default |
|-----------|------|---------|
| `authFlow` | `"normal" \| "recovery"` | `"normal"` |

| New Function | Purpose |
|--------------|---------|
| `setAuthFlow(flow)` | Allows Auth.tsx to set recovery mode |

---

### File 2: `src/App.tsx`

**Changes to PublicRoute (lines 93-109):**
- Import `authFlow` from `useAuth()`
- Modify redirect condition to respect recovery mode

```text
Before: if (user) → redirect
After:  if (user && authFlow !== "recovery") → redirect
```

This ensures users in recovery mode stay on `/auth` even though they're technically authenticated.

---

### File 3: `src/pages/Auth.tsx`

**Changes:**

1. **Extend mode state type:**
   - Current: `"signin" | "signup" | "forgot"`
   - New: `"signin" | "signup" | "forgot" | "reset-password"`

2. **Add new state:**
   - `newPassword: string`
   - `confirmPassword: string`
   - `linkExpired: boolean` (for error state)

3. **Add recovery detection useEffect:**
   - Subscribe to `supabase.auth.onAuthStateChange`
   - On `PASSWORD_RECOVERY` event:
     - Set `mode` to `"reset-password"`
     - Call `setAuthFlow("recovery")` from context
   - Also detect recovery from URL hash on mount as fallback
   - If hash contains `type=recovery` but no session, show "link expired" state

4. **Add handleResetPassword function:**
   - Validate passwords match
   - Call `supabase.auth.updateUser({ password })`
   - On success:
     - Show success toast
     - Sign out to clear recovery session
     - Clear URL hash and query params
     - Reset `authFlow` to `"normal"`
     - Switch mode to `"signin"`
   - On failure: Show error toast, stay on form

5. **Add Reset Password form UI:**
   - Header: "Set New Password"
   - New password input (minLength 6)
   - Confirm password input
   - Submit button with loading state
   - Back to sign in link

6. **Add Link Expired UI:**
   - Header: "Reset Link Expired"
   - Message explaining the link is no longer valid
   - Button to request new reset link (switches to forgot mode)

---

## UI Specifications

### Reset Password Form

```text
┌─────────────────────────────────────────┐
│          [AccountancyOS Logo]           │
│                                         │
│         Set New Password                │
│   Enter your new password below         │
│                                         │
│  New Password                           │
│  ┌─────────────────────────────────┐    │
│  │ ••••••••                        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Confirm Password                       │
│  ┌─────────────────────────────────┐    │
│  │ ••••••••                        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │        Update Password          │    │
│  └─────────────────────────────────┘    │
│                                         │
│         ← Back to Sign In               │
│                                         │
└─────────────────────────────────────────┘
```

### Link Expired State

```text
┌─────────────────────────────────────────┐
│          [AccountancyOS Logo]           │
│                                         │
│         Reset Link Expired              │
│                                         │
│  This password reset link has expired   │
│  or has already been used.              │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │     Request New Reset Link      │    │
│  └─────────────────────────────────┘    │
│                                         │
│         ← Back to Sign In               │
│                                         │
└─────────────────────────────────────────┘
```

---

## Edge Cases Handled

| Scenario | Handling |
|----------|----------|
| User clicks expired link | Hash detected but no session → show "Link Expired" UI |
| User clicks already-used link | Same as expired |
| User refreshes during reset | Recovery session persists, form re-renders |
| Passwords don't match | Client-side validation error shown |
| Password too short | Supabase returns error, displayed to user |
| User cancels and goes to sign-in | Back link available, authFlow reset on successful sign-in |
| Normal sign-in after fix | Works as before, authFlow defaults to "normal" |

---

## Testing Checklist

After implementation, verify:

- [ ] Password reset email can be requested
- [ ] Clicking email link shows reset form (not redirected)
- [ ] Entering mismatched passwords shows error
- [ ] Submitting valid password updates successfully
- [ ] User is signed out after successful update
- [ ] URL is cleaned (no hash/query params)
- [ ] User can sign in with new password
- [ ] Expired/used links show clear error message
- [ ] Normal sign-in flow still works
- [ ] Normal sign-up flow still works
- [ ] Authenticated users still redirect from /auth (when not in recovery)

---

## Files Summary

| File | Changes |
|------|---------|
| `src/lib/auth-context.tsx` | Add `authFlow` state and `setAuthFlow` function |
| `src/App.tsx` | Update PublicRoute to check `authFlow` before redirect |
| `src/pages/Auth.tsx` | Add recovery detection, reset form, expired state, submit handler |

