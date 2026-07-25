# AccountancyOS Proposal Scope, Periods, Billing and Signatories

Date: 25 July 2026  
Status: Approved product design; implementation requires codebase discovery

## Objective

Upgrade the AccountancyOS proposal process so that the exact services, compliance periods, fees, billing arrangements and signatories agreed with a client activate the correct services, jobs, deadlines and automations after signing.

The proposal must remain simple for accountants and clients. Statutory or filing-software complexity that is not needed to define the commercial scope must remain outside the proposal journey.

## Mandatory implementation constraint

Before introducing any model, status, service name, job type, period type, billing concept, component or API, inspect the existing AoS implementation and reuse its architecture and vocabulary wherever suitable.

For every proposed concept, classify the implementation as:

1. Reuse an existing concept unchanged.
2. Extend an existing concept.
3. Introduce a new concept because no suitable equivalent exists.

Do not create parallel proposal models, duplicated services, competing status enums, alternative job systems or new terminology for concepts already represented in the code. Existing completed proposal features must not be rebuilt merely because they appear in this specification.

## Core principles

1. Proposal scope, job activation and billing are related but independent.
2. A proposal item can be operationally active without being billable.
3. No live services or jobs are created before the required signatures are obtained.
4. Billing or Stripe failure does not prevent or reverse proposal acceptance or job creation.
5. Exact compliance periods are required where they materially define scope and downstream jobs.
6. Client-facing simplicity takes priority over exposing filing-software mechanics.
7. Accepted proposal versions are immutable and auditable.
8. Required signatures control scope activation; billing completion is a separate onboarding concern.
9. Billing method is selected per client or proposal, using a practice default where available.

## Proposal journey

### 1. Select the client and entity

Use the existing lead/client flow and entity vocabulary.

For limited companies, use the existing Companies House integration to prefill company data and retrieve active directors. Do not request information already held by AoS unless confirmation is necessary.

### 2. Select services

Each service remains a separate scope item, including services charged at zero.

Examples include:

- Accounts
- CT600
- Confirmation statement
- VAT returns
- MTD quarterly filing
- MTD annual submission
- Self Assessment tax return

A zero-priced item:

- Is displayed to the client as **Included**.
- Remains in the signed scope.
- Activates its service and jobs normally.
- Contributes zero to proposal totals.
- Does not create a Stripe Price, invoice line, Payment Intent, subscription item or external charge.

Where useful, AoS may associate an Included item with a paid item, such as CT600 included with Accounts, using an existing relationship mechanism if one is available.

### 3. Define service periods

Only ask for information needed to define scope, price the work, create jobs or calculate deadlines.

#### Self Assessment

- Ask how many tax returns are required.
- Require selection of the exact tax years.
- Create a separate proposal scope item for each tax year.
- Each accepted item creates its own Self Assessment tax return job.
- Historic-only work must not force an ongoing service.

#### Company accounts

- Prefill the first outstanding accounts period from Companies House:
  - `accounts.next_accounts.period_start_on`
  - `accounts.next_accounts.period_end_on`
  - `accounts.next_accounts.due_on`
  - `accounts.next_accounts.overdue`
- Require the accountant to confirm the prefilled period.
- Permit correction where practice information differs.
- If further catch-up accounts periods are required, allow the accountant to add them individually.
- AoS may propose the next sequential period using the accounting reference date, but each period must be confirmed.
- Each accounts period is a separate proposal item and creates a separate Accounts job.

#### CT600

- Keep CT600 as a separate scope and pricing item from Accounts.
- Label it against the associated accounts year end, for example, `CT600 — year ended 31 March 2026`.
- Allow a zero fee, displayed as Included.
- Do not ask the accountant to configure Corporation Tax accounting-period splits in the proposal.
- Acceptance creates one linked CT600 job for the accounts year.
- The CT600 job depends on finalised accounts using existing AoS job/workflow dependency mechanisms.
- Final accounts data flows to the tax computation or filing software.
- Filing software determines whether one or multiple CT600 submissions are required.
- Where supported, import returned CT600 periods, liabilities, payment dates and submission statuses into the existing job, filing or obligation structure.
- Where no integration exists, allow manual confirmation through the existing workflow.
- Keep one top-level CT600 job for the accounts year. If multiple submissions are required, represent them beneath that job using existing filing/submission concepts.
- Complete the CT600 job only when all required submissions are accepted.

Do not add long-period configuration or warnings to the proposal journey.

#### VAT

- Require filing frequency: monthly, quarterly or annual accounting.
- Require the VAT stagger or annual period end.
- Generate valid VAT periods rather than accepting arbitrary free-text date ranges.
- Require selection of every exact catch-up VAT period.
- Each selected period is separately priced and creates its own VAT job.
- Require identification of the first ongoing VAT period where ongoing VAT work is proposed.

#### MTD ITSA

Keep these as distinct scope and operational service types:

- MTD quarterly filing
- MTD annual submission
- Self Assessment tax return

For an applicable tax year, create separate jobs for each quarterly filing, the annual MTD submission, and the Self Assessment tax return where selected. Each job has its own deadline, status, automation and filing evidence.

Use any existing AoS or HMRC obligation model to determine applicable obligations. Do not hard-code assumptions where the existing architecture already represents the obligations.

### 4. Pricing and billing

Each chargeable item records, using existing AoS concepts where available:

- Fee using the existing AoS money representation.
- One-off or recurring treatment.
- Service coverage period.
- Billing start date or due date.
- Billing method: AoS billing through Stripe or billing managed externally.

Preserve the existing AoS `numeric` money representation if code inspection confirms that it is used consistently and safely. Validate supported precision and convert amounts through one existing or centralised Stripe-boundary function. Do not introduce a second competing money representation through a partial migration to integer minor units.

`Included` is derived from a zero fee. Do not add a separate `is_chargeable` flag unless code inspection establishes a compelling technical requirement and the implementation enforces an invariant that prevents it drifting from the price.

Version one deliberately avoids automatic proration and complex instalment calculations.

- Historic periods are separate one-off items.
- Ongoing services use a monthly fee and explicit billing start date.
- If a practice needs to recover fees between service commencement and monthly billing commencement, it adds a separate one-off `Ongoing service catch-up` item.

#### Billing-method selection

The practice may define an organisation-level default billing method. The accountant can select or override the method for each client or proposal.

Initial methods are:

- AoS billing through Stripe.
- Billing managed externally.

Reuse existing AoS enum values and vocabulary where suitable. Do not introduce these exact labels as new canonical terms if equivalent concepts already exist.

The selected billing method is stored in the accepted proposal snapshot and audit trail. Stripe may only be selected if the accountant's practice has completed the required Stripe Connect setup.

#### AoS billing through Stripe

- Only positive-value billing instructions are sent to Stripe.
- Process one-off and recurring charges independently.
- The accountant's client completes the applicable payment or payment-method setup.
- Mark the billing step complete only after Stripe confirms completion.
- Reuse existing awaiting, processing, completed and failed statuses where available.
- A failure creates a visible, retryable billing issue.
- A failure does not block or reverse acceptance, services, jobs, deadlines or automations.

#### Billing managed externally

- Record the agreed fee and schedule for reporting.
- Perform no Stripe collection.
- Treat the billing step as settled outside AoS, reusing the existing `not_required`, `skipped` or closest canonical state.
- Preserve identical proposal, scope and job behaviour.

If the existing acceptance flow collects payment details, reuse it. Do not introduce a second payment-setup journey.

#### Changing the billing method

An accountant may switch an accepted client from Stripe to externally managed billing through an explicit audited action.

- Safely cancel any pending Stripe checkout or future collection schedule where appropriate.
- Do not alter the signed service scope.
- Do not delete or roll back services, jobs, deadlines or automations.
- Preserve the previous and new billing methods in the audit trail.

Do not make a new Stripe Connect webhook a prerequisite for this proposal upgrade. First determine whether the existing verified polling and payment-status mechanisms can support durable, idempotent completion. Add or amend a webhook only if necessary and consistent with the existing integration architecture. Do not broaden this work into a general Stripe rewrite.

### 5. Contacts and signatories

For Self Assessment, use the existing linked individual as the proposed signatory.

For limited companies:

- Retrieve and show active directors from Companies House.
- Allow selected directors to be added as company contacts.
- Require one primary contact.
- Require an email address for each signatory.
- Allow one or more signatories.
- Support:
  - **All selected signatories must sign**, as the default.
  - **Any one selected signatory may sign**.
- Allow manual contacts or signatories when Companies House is unavailable or a non-director is appropriate.
- Do not automatically add resigned directors.
- Preserve manually entered email addresses and contact preferences during refresh.

The proposal stores its own signatory snapshot. Later changes to company contacts or Companies House data must not silently change an in-flight proposal.

### 6. Review and send

Before sending, show:

- Client and entity.
- Every service and exact applicable period.
- Catch-up items.
- Included items.
- One-off total.
- Monthly recurring total.
- Billing dates and collection method.
- Signatories and signature rule.
- The jobs expected to activate after acceptance.

Draft and sent proposals contain proposed job definitions only. They do not create live services or jobs.

### 7. Acceptance and activation

Once the selected signature rule is satisfied:

1. Lock an immutable snapshot of the accepted proposal version.
2. Record the acceptance and signature audit trail.
3. Activate the agreed services.
4. Create the period-specific jobs and deadlines.
5. Attach the relevant existing automation templates.
6. Create internal billing instructions.
7. Queue Stripe processing independently where applicable.

Activation must be idempotent. Retries, duplicate signature callbacks or billing retries must not create duplicate services, jobs, invoices or subscriptions.

The signed-engagement activation gate and billing-completion gate are distinct:

- Signature-rule completion controls proposal acceptance, service activation, job creation, deadline creation and automation attachment.
- Billing status controls only whether the billing portion of onboarding is complete.
- Stripe failure leaves the accepted engagement and live work intact while billing remains incomplete or requires attention.
- Externally managed billing may immediately satisfy the billing-completion step as settled outside AoS.

If the existing canonical onboarding gate requires `billing_settled` before service or job activation, extend or split that gate. Do not create a parallel activation system.

## Proposal statuses and sales events

Reuse the existing proposal lifecycle and event vocabulary. Extend it only where required to represent:

- Draft
- Sent
- Delivered
- First viewed
- Last viewed
- Partially signed
- Accepted
- Declined
- Expired
- Superseded

Do not duplicate statuses already captured by events or existing state.

### Decline reasons

Decline reasons are an approved addition.

When a recipient declines a proposal:

- Require the client to select one structured decline reason before confirming an active decline.
- Allow an optional client free-text comment.
- Preserve the original client-selected reason and comment as immutable response data.
- Allow the practice to record a separate internal outcome reason when follow-up establishes a more useful reporting category; do not overwrite the client's answer.
- Record who declined and when.
- Move the proposal to the existing declined or review-required state.
- Do not activate services, jobs, billing or automations.
- Surface the decline in the CRM/proposal pipeline.
- Make structured decline reasons available for conversion reporting.

Proposal expiry is not an active client decline. AoS may record `No response / proposal expired` automatically as an outcome without fabricating a client-selected reason.

Initial structured reasons should reuse any existing CRM loss-reason vocabulary. If none exists, use a small configurable list with an `Other` option rather than creating an extensive fixed taxonomy. Suggested starting values:

- Price
- Chose another accountant
- Services or scope did not meet needs
- Timing or not ready
- No longer requires the service
- No response / proposal expired
- Other

The implementation must avoid creating separate, competing `decline reason`, `loss reason` and `lead outcome reason` models when one shared concept can serve the CRM and proposal lifecycle.

## Validation

Block sending when:

- A service requires a period and none is present.
- VAT catch-up is selected without exact VAT periods.
- A period is invalid or duplicated.
- A recurring charge has no billing start date.
- No signatory is selected.
- A signatory has no email address.
- A limited company has no primary contact.
- Stripe billing is selected but the practice has not completed the required Stripe Connect setup.

Warn without necessarily blocking when:

- Companies House data could not be refreshed.
- A statutory deadline has passed.
- A first recurring period overlaps a catch-up period.
- External billing is selected for a Stripe-enabled practice.
- An equivalent live job may already exist.

Use existing validation and notification patterns.

## Important edge cases

- `All must sign`: remain partially signed until every required signature is complete.
- `Any one may sign`: the first valid signature completes acceptance and remaining requests become unnecessary.
- Revising a sent proposal creates a new version and invalidates signatures on the superseded version.
- Accepted versions cannot be silently edited.
- Duplicate callbacks do not repeat activation.
- A Stripe failure does not roll back the accepted engagement.
- A Stripe failure does not delay service or job activation after the signature rule is satisfied.
- Externally managed billing creates no Stripe objects and satisfies only the billing-completion step.
- Switching billing method after acceptance is explicit and audited.
- Refunds or subscription cancellation do not delete the signed scope or jobs.
- Fee or service changes after acceptance use the existing variation, renewal or re-engagement process.
- If an equivalent job already exists, flag it for review rather than silently duplicating it.

## Audit requirements

Record:

- Creator and editors.
- Proposal versions.
- Send, delivery and view events where already supported.
- Signatories, signature events and applied signature rule.
- Acceptance, decline, expiry and supersession.
- Decline reason and free-text comment.
- Companies House data and retrieval time used for the proposal.
- Activated services, jobs, deadlines and automations.
- Billing instructions, attempts, identifiers and failures.
- Billing-method selection and any later audited change.

## Reuse of existing completed capabilities

The following capabilities are believed to be largely implemented and must be inspected before any work is proposed:

- Proposal and service templates.
- Pricing defaults and overrides.
- Branded proposal presentation.
- Engagement letters.
- Electronic signatures.
- Proposal tracking and reminders.
- Stripe or payment setup.
- Accepted-proposal onboarding.
- Service-to-job and automation mapping.
- Renewals, variations or re-engagement.

The implementation plan must identify actual gaps against this specification. It must not rebuild these features unless the code inspection demonstrates that a targeted extension is necessary.

## Delivery sequence

### Phase 0: Codebase discovery

- Map the current proposal, service, billing, signature, Companies House, job, deadline, automation and CRM-loss-reason architecture.
- Produce a gap matrix against this specification.
- Mark every design concept as reuse, extend or introduce.
- Confirm naming with the existing code vocabulary.

### Phase 1: Shared scope and period behaviour

- Extend the existing proposal-item model only as necessary.
- Add SA tax-year selection.
- Add company-accounts period prefill and confirmation.
- Add exact VAT-period selection.
- Add distinct MTD quarterly, annual and SA job mappings.
- Preserve separate Accounts and CT600 items.
- Support Included zero-fee scope items without billing objects.

### Phase 2: Contacts, signatures and activation

- Add the limited-company contacts/signatories step.
- Add `all` versus `any one` signature rules.
- Ensure acceptance creates live jobs only after required signatures.
- Make activation idempotent and independent from Stripe success.
- Separate signed-scope activation from billing completion using existing gate architecture.
- Add per-client/proposal billing-method selection with a practice default.
- Reuse existing external/not-required billing states.

### Phase 3: Decline reasons and reporting

- Reuse or extend CRM loss reasons.
- Capture structured and free-text decline information.
- Surface decline outcomes in the pipeline and reporting.

### Phase 4: Verification and migration

- Test existing proposal flows for regression.
- Migrate data only if the codebase inspection demonstrates a need.
- Avoid speculative backfills for data not required by the approved behaviour.

## Acceptance criteria

1. An accountant can quote multiple exact SA tax years and acceptance creates one job per year.
2. Company accounts prefill the next filing period from Companies House and remain confirmable/editable.
3. Accounts and CT600 appear separately; a zero-fee CT600 displays as Included and creates no billing charge.
4. CT600 proposal scope uses the accounts year end without exposing CT period splitting.
5. VAT frequency and stagger generate valid periods, and every catch-up period must be explicitly selected.
6. MTD quarterly filings, MTD annual submission and SA return create separate deadline-bearing jobs.
7. Historic work is billed through separate one-off items; monthly billing has an explicit start date.
8. Stripe-enabled and externally billed proposals share the same commercial and job behaviour.
9. The accountant can select Stripe or externally managed billing per client/proposal, subject to the practice Stripe setup.
10. Externally managed billing creates no Stripe objects and is treated as settled outside AoS.
11. Stripe billing is complete only after Stripe confirmation.
12. Stripe failure does not block or reverse acceptance or job creation.
13. Limited-company directors can be imported as contacts and selected as signatories.
14. `All must sign` is the default; `any one may sign` is selectable.
15. No live job is created before the required signature rule is satisfied.
16. Repeated acceptance or callback processing creates no duplicates.
17. Declining captures the actor, time, structured reason and optional free text without activating downstream work.
18. Existing AoS architecture and vocabulary are reused, with no duplicate models or terminology drift.

## Resolved discovery decisions

The Phase 0 code discovery produced the following implementation decisions:

1. Use the canonical activation path and retire or neutralise legacy accept-time job creation.
2. Derive Included from a zero fee; do not add an independent chargeability flag without a demonstrated technical need.
3. Represent each applicable MTD quarterly filing, the MTD annual submission and the SA return as separate jobs.
4. Use one shared structured vocabulary for proposal declines and CRM loss outcomes, while keeping expiry/no-response separate from active client reasons.
5. Keep one top-level CT600 job per accounts year and represent filing-software splits through the existing filing/submission architecture.
6. Do not make a new Stripe Connect webhook a prerequisite; add one only if existing payment verification cannot provide durable idempotent completion.
7. Retain the existing consistent AoS money representation and perform validated Stripe conversion at the integration boundary.
8. Use a client/proposal-level billing method with a practice default, not a generic Stripe boolean.
9. Separate signature-controlled scope activation from billing-controlled onboarding completion.

## Out of scope for this release
- Client-selectable three-tier packages.
- Client-selected add-ons.
- AI or market-derived price recommendations.
- Automatic proration.
- Complex instalment schedules.
- CT600 period configuration in the proposal.
- A general Stripe integration rewrite.
- Rebuilding proposal features already implemented.
