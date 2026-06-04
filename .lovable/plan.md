Hide the Service Code field from the Edit/Add Service dialog so accountants only see Service Name + Billing Model (and the rest of the user-facing fields).

## Why hide rather than remove

Service Code is the machine-readable identifier that drives automations, chasers, and conditional logic across the app (15 standard codes). It must still exist on the record — we just don't expose it in the UI.

## Changes

`src/pages/Services.tsx` — Add/Edit Service dialog:
- Remove the Service Code `<Input>` and its label.
- Collapse the 2-column grid so Billing Model sits on its own row (or pair it with Default Price).
- On submit:
  - **Edit**: keep the existing `code` value untouched.
  - **Create**: auto-generate `code` from the Service Name (uppercase, non-alphanumerics → `_`, trimmed). If a service with that code already exists in the org, append a numeric suffix (`_2`, `_3`, …).
- Drop the `required` validation tied to the field.

No schema changes — `code` remains NOT NULL in the DB and is still populated on every insert.