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

- Fee in integer minor currency units.
- One-off or recurring treatment.
- Service coverage period.
- Billing start date or due date.
- Collection through AoS/Stripe or externally.

Version one deliberately avoids automatic proration and complex instalment calculations.

- Historic periods are separate one-off items.
- Ongoing services use a monthly fee and explicit billing start date.
- If a practice needs to recover fees between service commencement and monthly billing commencement, it adds a separate one-off `Ongoing service catch-up` item.

For Stripe-enabled billing:

- Only positive-value billing instructions are sent to Stripe.
- Process one-off and recurring charges independently.
- Payment failure creates a visible, retryable billing issue.
- Payment failure does not block or reverse acceptance, services, jobs, deadlines or automations.

For external billing:

- Record the agreed fee and schedule for reporting.
- Perform no Stripe collection.
- Preserve identical proposal, scope and job behaviour.

If the existing acceptance flow collects payment details, reuse it. Do not introduce a second payment-setup journey.

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
9. Stripe failure does not block or reverse acceptance or job creation.
10. Limited-company directors can be imported as contacts and selected as signatories.
11. `All must sign` is the default; `any one may sign` is selectable.
12. No live job is created before the required signature rule is satisfied.
13. Repeated acceptance or callback processing creates no duplicates.
14. Declining captures the actor, time, structured reason and optional free text without activating downstream work.
15. Existing AoS architecture and vocabulary are reused, with no duplicate models or terminology drift.

## Out of scope for this release

- Client-selectable three-tier packages.
- Client-selected add-ons.
- AI or market-derived price recommendations.
- Automatic proration.
- Complex instalment schedules.
- CT600 period configuration in the proposal.
- Rebuilding proposal features already implemented.
