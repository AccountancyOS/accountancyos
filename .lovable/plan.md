## Problem

When the Bassage Eyes quote was accepted, `public_accept_quote_by_token` correctly created both a company client (`Bassage Eyes Ltd`) and a self-assessment client. The SA client, however, was created with `first_name = "Bassage Eyes Ltd"`, `last_name = ""` — because the function copies `lead.first_name / lead.last_name` verbatim, and the lead had the company name stored in its name fields (from the Companies House lookup).

A self-assessment is filed against an individual, so the SA client must be in the name of the **director** of the company, not the company itself.

## Fix going forward

Update `public.public_accept_quote_by_token` so that, when it auto-creates the SA client alongside a company, it resolves the director name from the best available source instead of just copying the lead's name fields. Priority:

1. `contacts` row for the company where `role = 'Director'` (prefer `is_primary = true`) — use `name`, `email`, `phone`.
2. `company_officers` joined to `company_persons` where `role ILIKE 'director%'` and `resigned_at IS NULL` (earliest appointed wins) — use `first_name`, `last_name`, `email`, `phone`.
3. `companies.ch_company_profile -> 'officers'` JSON: first entry whose `officer_role` starts with `director` and `resigned_on` is null — split `name` ("LAST, First Middle" CH format) into `first_name` / `last_name`.
4. Lead `first_name` / `last_name` **only if** the combined value is not equal (case-insensitive) to the company name.

If none of those yield a usable name, **do not create an SA client or SA engagement/job**. Instead insert an `automation_events` row with `event_type = 'SA_DIRECTOR_DETAILS_REQUIRED'`, `entity_type = 'company'`, `entity_id = company_id`, and metadata `{quote_id, lead_id, missing_service: 'sa_*'}` so the practice is prompted to add the director before the SA work is provisioned. The company engagement/jobs from the same quote still get created.

The SA client's `email` should prefer the director contact's email; only fall back to the lead email if no director email is known (it's common for the SA client to share the lead email at this stage).

Also de-duplicate against existing clients by lower(email) + client_type as today.

## Backfill for the existing Bassage Eyes SA record

There are currently no contacts, officers, persons, or CH officer JSON on file for Bassage Eyes Ltd, so the system has no record of who the director is. Two options for the existing SA client `7a43f7bf-...`:

- **A.** I delete the SA client (and the SA engagement / job created from the same quote), and the practice re-runs once a director contact is added.
- **B.** You tell me the director's first name and last name (and email if different from `amyleestevens7@gmail.com`); I rename the existing SA client in place.

Pick one in your next message — I'll only carry out the backfill you choose. The function fix will go in regardless.

## Technical notes

- Single migration: `CREATE OR REPLACE FUNCTION public.public_accept_quote_by_token(text)`, preserving every other behaviour (engagements, jobs, deadlines, lead conversion, tokens). Only the SA-branch identity resolution and the "no director → skip + raise event" guard change.
- Add a small helper `public.resolve_company_director(company_id uuid, lead_id uuid, org_id uuid)` returning `(first_name text, last_name text, email text, phone text, source text)` so the logic is reusable (e.g. when later adding a "Generate SA client" action on a company).
- Frontend: no changes required. The existing clients list will show the corrected SA client by director name once the function returns the right values.
