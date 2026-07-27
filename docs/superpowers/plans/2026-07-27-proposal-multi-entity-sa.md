# Proposal — multi-entity proposals (company + self-assessment individual) — Plan

> Owner decisions taken 2026-07-27. Grounding: `docs/superpowers/specs/2026-07-25-proposal-scope-periods-signatories-design.md`,
> `docs/superpowers/plans/2026-07-25-proposal-phase2-signatories-activation-billing.md` (T2a–T2e shipped).

**The requirement.** A self-assessment is for an individual, who is a separate legal entity from the
company. When an SA service is added to a company's proposal, the accountant must name that individual
and capture their details, and the individual must sign their **own** engagement letter — not the
company's. The individual should receive **one** email and be presented with every document they need
to sign through that single link.

## Decisions (owner, 2026-07-27)

1. **One proposal, two engagement letters.** A single proposal covers both entities; SA lines are
   attributed to the named individual. Acceptance produces one engagement letter **per legal entity**,
   each with its own signature evidence and signing rule.
2. **Billing is split per entity.** The company is billed for company services; the individual is
   billed for their own SA. Two payment journeys per proposal — so billing cannot be modelled once per
   proposal.
3. **Signing is sequential and resumable.** One link per person walks them through each document
   awaiting their signature, recording each signature as it is given. Leaving after the first document
   is fine; the link reopens at the next one.
4. **The SA individual is any individual** — usually also a company director (in which case their
   letters merge into one email/link), but a spouse, shareholder or family member must be allowed.

## What the schema forces

`public.engagement_letters.onboarding_application_id` is **NOT NULL** (verified in
`src/integrations/supabase/types.ts`). An engagement letter cannot exist without an onboarding
application. Combined with decision 2 — `billing_status`, `billing_method` and the activation gate all
live on `onboarding_applications` — the model follows directly:

> **One accepted proposal → one onboarding application PER LEGAL ENTITY, linked as a group.**

Each application carries its own engagement letter, its own signature rule, its own billing journey and
its own activation gate. Jobs and deadlines materialise per entity, against the right client. Nothing
forks: this reuses `lifecycle_onboarding_gates`, `lifecycle_approve_onboarding`,
`lifecycle_materialize_jobs`, `el_signature_progress` and the T2d-2 signing protocol exactly as they
are. The alternative — one application spanning two entities — would require every one of those to
learn about entity scope, and would put two legal parties behind one gate.

The single new structural idea is a **group key** so sibling applications (and therefore sibling
letters) can be found from any one of them. That is what makes decision 3 implementable: the emailed
token identifies one signatory row, and the read path resolves that person's other outstanding letters
within the group by normalised email.

## Increments

Each is one small additive migration (or none), owner-applied, receipt-gated — per the standing
increment contract.

### E1 (migration): entity attribution + the proposal group
- `quote_lines.subject_kind text` (`'company' | 'individual'`) + `quote_lines.subject_ref uuid` — which
  legal entity a line's services belong to. Defaults keep every existing line the company's.
- `quotes.subject_snapshot jsonb` — the proposal's own immutable record of the individual subject(s)
  (name, email, existing client/person id or null when newly created), mirroring how
  `signatory_snapshot` already works.
- `onboarding_applications.proposal_group_id uuid` — siblings from one accepted proposal.
  Index it; null for every existing row (a group of one).
- Nothing reads these yet.

### E2 (UI): naming the individual at proposal time
- Adding an SA/individual service to a company proposal requires an individual subject: pick an existing
  client/person or create one inline with name + email (the minimum needed to sign; the rest is captured
  by their own onboarding). Blocks acceptance until provided — an unattributed SA line has no
  contracting party.
- Lines grouped by entity in the proposal UI and on the review screen, so the accountant sees exactly
  which entity is buying what and what each will be billed.
- Signatories step gains the individual: they sign their own letter personally, and if they are also a
  company signatory the UI says so rather than asking twice.

### E3 (acceptance): one proposal → N applications + N letters
- Extend the acceptance path to create one onboarding application per entity, sharing a
  `proposal_group_id`, each with the quote lines attributed to it and its own engagement letter +
  signatory rows (seeded exactly as T2d-3 already seeds them).
- Idempotent on re-acceptance, keyed on the group.

### E4 (signing): the sequential resumable bundle
- Extend `public_get_engagement_letter_for_signing` to return, alongside the current letter, the
  person's **other** outstanding letters in the same `proposal_group_id` (matched on normalised email),
  as an ordered list with progress.
- The signing page becomes "Step N of M", advancing on each recorded signature and reopening at the
  first unsigned document. Each signature is recorded independently by the existing
  `public_sign_engagement_letter_as_signatory` — no change to the write path.
- Dispatch sends **one** email per person for the whole group, not one per letter.

### E5 (billing): per-entity billing method
- Folds into T2c. Billing method is chosen per **application** (entity), with the org default applied
  to each; the company and the individual each settle their own. Presented on the proposal as two
  totals so the accountant and client both see the split before acceptance.
- Activation is already decoupled from billing (T2b), so neither entity's unpaid invoice blocks the
  other's jobs.

## Risks

- **Fee visibility.** Two totals on one proposal must be unambiguous about who pays what, or clients
  will dispute it. The review screen is the control.
- **Duplicate identities.** An SA individual created inline could duplicate an existing client or
  company person. E2 must offer existing matches (by email) before creating.
- **Group-of-one is the common case.** Every path must behave identically when a proposal has a single
  entity — that is the regression risk, and where the tests should be heaviest.
