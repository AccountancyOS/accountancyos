## What's broken

On the Branding page, both logo upload slots (Light and Dark) have the same UX bug in their **empty state** (when no logo has been uploaded yet):

```tsx
<label className="cursor-pointer block">
  <Upload ... />
  <span>Click to upload</span>
</label>
<input id="logo-light-input" type="file" className="hidden" ... />
```

The `<label>` has no `htmlFor` attribute, and the `<input>` is its **sibling**, not a child. So clicking "Click to upload" does nothing — no file picker, no error, no toast. That's why uploads appear silently broken.

The "Replace" path (after a logo already exists) works, because it calls `document.getElementById(...).click()` directly. Empty state never gets that chance, which is why a first-time upload always fails.

The Cloud side is healthy:
- `branding` storage bucket exists, set to public on 2026-05-31
- RLS policies allow members of the organization to insert/read/update/delete under `{org_id}/...`
- `organization_branding` table + upsert logic are correct

So this is a pure frontend wiring bug, not a permissions or storage issue.

## Fix

In `src/pages/settings/BrandingSettings.tsx`, in both empty-state branches (Light and Dark logo slots):

1. Replace the non-functional `<label>` with a `<button type="button">` that calls `document.getElementById("logo-light-input").click()` (or `"logo-dark-input"`), matching how the Replace button already works.
2. Add `disabled={uploadingLight}` / `disabled={uploadingDark}` so users can't double-trigger during upload.
3. Keep the dashed border, upload icon, and "Click to upload" / "Uploading…" text exactly as they are now.
4. Add a tiny defensive check in `handleLogoUpload`: reject files >2MB and reject anything that isn't `image/png` or `image/svg+xml`, with a clear toast — the card promises "PNG or SVG, max 2MB" but nothing enforces it client-side, so a too-large PNG today would fail at the storage layer with a confusing message.

No backend changes, no storage changes, no schema changes.

## Acceptance

- Click the empty Light or Dark logo card → native file picker opens
- Selecting a valid PNG/SVG uploads it, shows a success toast, and the preview appears
- Selecting a >2MB or wrong-type file shows a friendly toast and nothing is uploaded
- Replace flow continues to work as before
