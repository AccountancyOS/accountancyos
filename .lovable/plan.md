## Persist and rehydrate onboarding wizard inputs

### Cause

`PracticeProfileStep` (and its sibling step components) hold form values in local `useState` initialised to empty strings:

```ts
const [formData, setFormData] = useState({ address_line_1: "", ... });
const [logoUrl, setLogoUrl] = useState<string | null>(null);
```

There is no effect that loads existing data from `organizations` / `organization_branding`. When the user navigates away from `/onboarding-wizard`, the component unmounts and that state is destroyed. On return, the inputs render blank — both for already-saved values and for typed-but-unsubmitted values.

### Fix (two layers)

**1. Rehydrate from the database on mount** — the canonical source of truth.

In `PracticeProfileStep`, add a `useEffect` keyed on `organizationId` that fetches:

- `organizations.address_line_1, address_line_2, city, postcode, country`
- `organization_branding.logo_light_url` (and address fields as a fallback if the org row is empty)

Populate `formData` and `logoUrl` from whichever row has values, preferring `organizations` for address fields (it is the source the submit handler writes back to). Show the existing logo as `logoPreview` using the public URL.

**2. Draft autosave for in-progress typing** — covers the case where the user navigates away before clicking Save.

Persist `formData` (not the logo file) to `localStorage` under a per-org key:

```
onboarding_wizard_draft:practice_profile:{organizationId}
```

- On every change, write the current `formData` to localStorage (debounced or on each setState is fine; the payload is tiny).
- On mount, after the DB load resolves, merge the draft on top of the DB values so unsaved edits win until they are saved.
- On successful submit (`handleSubmit` after the upsert succeeds), remove the draft key.

This pattern matches how a user expects a wizard to behave: the form remembers what they typed, and confirms it once they hit Save.

### Apply the same pattern to the other steps

The same bug applies to the rest of the wizard. Audit and add the same DB-rehydration + draft-autosave to:

- `PracticeSetupStep` (timezone, service catalog) — rehydrate from `organizations` / settings table.
- `ComplianceSetupStep` (HMRC, Companies House) — rehydrate from the credentials/connection rows it writes to.
- `TeamSetupStep` — already list-driven (invites table), but verify form drafts behave the same.
- `CRMSetupStep`, `DataImportStep` — rehydrate any persisted selections.

Scope of this change is per-step DB read + draft autosave, no schema changes, no new tables. Each step keeps its own draft key namespace (`onboarding_wizard_draft:{step_key}:{organizationId}`).

### Acceptance

1. On `/onboarding-wizard` step 1, type an address line 1, do **not** click Save, navigate to `/overview`, return to `/onboarding-wizard` → the address line 1 is still in the field.
2. Click Save & Continue on step 1, go to step 2, navigate to `/overview`, come back to step 1 → all saved fields render with the saved values from the database (logo preview included).
3. On step 1, change a saved value, navigate away without saving, come back → the unsaved edit is shown (draft wins). Clicking Save persists it and clears the draft key.
4. Repeat the same three checks on each of the other 5 steps.

### Files touched

- `src/components/onboarding-wizard/PracticeProfileStep.tsx` — add DB-load effect, draft autosave, draft hydration.
- `src/components/onboarding-wizard/PracticeSetupStep.tsx` — same pattern.
- `src/components/onboarding-wizard/ComplianceSetupStep.tsx` — same pattern.
- `src/components/onboarding-wizard/TeamSetupStep.tsx` — verify, add draft only if there is form input.
- `src/components/onboarding-wizard/CRMSetupStep.tsx` — same pattern if it has form state.
- `src/components/onboarding-wizard/DataImportStep.tsx` — same pattern if it has form state.
- Optional: extract the draft hook into `src/components/onboarding-wizard/useWizardDraft.ts` so all steps share one implementation.

No DB migrations, no backend changes.
