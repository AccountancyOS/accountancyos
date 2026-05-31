## Fix logo upload in onboarding (and the matching latent bug)

### Bug 1 — drop-zone has no `htmlFor`

`src/components/onboarding-wizard/PracticeProfileStep.tsx`

The empty-state UI renders:

```tsx
<label className="cursor-pointer block">
  <Upload ... />
  <p>Click to upload your practice logo</p>
</label>
<input id="logo-input" type="file" className="hidden" ... />
```

The `<label>` has no `htmlFor`, and the `<input>` is a sibling (not nested), so clicking the zone does nothing. Replace with `htmlFor="logo-input"` so the native label → input association fires the file picker:

```tsx
<label htmlFor="logo-input" className="cursor-pointer block">
```

That alone fixes the user's report.

### Bug 2 — `branding` bucket is private but code uses `getPublicUrl`

The `branding` storage bucket has `public = false`. RLS allows org members to read, but `getPublicUrl()` returns an unauthenticated URL that won't load images outside the upload session. Two files affected:

- `src/components/onboarding-wizard/PracticeProfileStep.tsx` (line 52–54)
- `src/pages/settings/BrandingSettings.tsx` (same pattern)

Practice logos are intended to be displayed in app chrome, emails, client portal, etc. — they should be publicly readable by URL. Fix: flip the bucket to public via a migration, then `getPublicUrl()` works as intended. Existing RLS write policies (org-scoped INSERT/UPDATE/DELETE) stay in place; only SELECT becomes anonymous.

```sql
update storage.buckets set public = true where id = 'branding';
-- The org-scoped read policy becomes redundant but harmless; leave it.
```

No code change needed in either consumer file once the bucket is public.

### Acceptance

1. From the practice onboarding step, click the dashed "Click to upload your practice logo" area → file picker opens.
2. Pick a PNG/SVG ≤ 2MB → "Logo uploaded" toast appears, preview renders.
3. Refresh the page or open the saved logo URL from a logged-out tab → image loads (was previously broken because of the private bucket).

### Files touched

- `src/components/onboarding-wizard/PracticeProfileStep.tsx` — add `htmlFor="logo-input"` on the empty-state label.
- New migration: `update storage.buckets set public = true where id = 'branding';`

No other components, no auth changes, no API surface changes.
