## Why It Failed

`src/components/client-portal/SendQuestionnaireDialog.tsx` inserts into `questionnaire_instances` with two values that the database rejects:

1. **`status: "draft"`** — the table's CHECK constraint only allows `sent | in_progress | submitted | reviewed`. The very first insert fails here.
2. **`access_token: "deprecated-use-public-links"`** — this column has a `UNIQUE` constraint, so even after fixing status, the second send from any client would fail with a duplicate-key error.

Secure tokens now live in `questionnaire_public_links` (created by the `create_questionnaire_public_link` RPC immediately after), so the legacy column just needs a unique placeholder per row.

## Fix

In `SendQuestionnaireDialog.tsx`, update the `.from("questionnaire_instances").insert(...)` call:

- Change `status: "draft"` to `status: "sent"` (matches the default and the CHECK constraint; the secure link RPC runs next so it really is sent).
- Replace the hardcoded `access_token` with `crypto.randomUUID()` so the `UNIQUE` constraint is always satisfied.

No schema migration needed — the table already enforces these rules correctly.

## Verification

From a client workspace, open Send Questionnaire, pick a template, submit. Confirm:
- Toast says "Questionnaire created — copy the link below"
- The instance appears in the Questionnaires tab
- Sending a second questionnaire to the same or another client also succeeds (no unique-token error)
