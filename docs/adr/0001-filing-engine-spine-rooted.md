# AccountancyOS — HMRC Filing Engine

## Pre–Sprint 0 Architecture Validation Report

**Status:** Architecture review only. No code, no migrations, no edge functions.
**Verdict:** Do **not** start the build from the current spec. Two structural corrections are required first — one credential, one architectural. Both are below, with a corrected target architecture.

-----

## 0. Executive verdict

Three conclusions, stated plainly:

1. **Credential model: use a single master AccountancyOS HMRC software application.** You are correct. More than that — this is the *standard* commercial model HMRC designed the platform around, not merely the preferable option. My spec left it as a genuine open question and described per-practice as “almost certainly” the answer. That was wrong, and I’ll explain exactly why below so the decision is defensible. There is one completing detail you didn’t state (each practice still needs its own Agent Services Account) — that is not a counterargument, it’s a necessary part of the master-app design.
1. **Centre of gravity: the spec is HMRC-rooted and must be re-rooted onto the AccountancyOS spine.** You are correct again. The spec gestured at the right principle (“HMRC calculates, we orchestrate”) but organised the entire data model and entity tree around HMRC nouns — `business_income_source`, `obligation_period`, `submission` — with the canonical model demoted to a sub-section. Worse, the canonical model I defined is *return-shaped* (`CanonicalTaxYearReturn`), which is itself a filing artefact, not the financial model. Built as-is, Claude Code would produce an excellent MTD product sitting beside, rather than downstream of, your accounting OS.
1. **One refinement to your own framing, offered sceptically because blind agreement is useless to you:** “all filings are downstream of approved accounting data” is exactly right for Self Assessment, MTD IT and Corporation Tax. It is *not* cleanly true for VAT and RTI, which are periodic and derive from the *ledger* and the *payroll subledger* at transaction grain, not from an annually-approved financial model. The unifying truth is **one spine (the ledger), consumed at the layer appropriate to each tax** — not “one return model everything inherits from.” Forcing VAT through an annual-accounts approval gate would break quarterly VAT. This strengthens your moat argument; it doesn’t weaken it.

The rest of this report works through your six required deliverables.

-----

## 1. Where the HMRC spec **aligns** with existing AccountancyOS architecture

These parts are sound and should survive into the build:

- **HMRC as a downstream submission target, not a source of truth.** The spec explicitly states the engine performs no tax calculation — HMRC’s `Individual Calculations` API computes liability; we orchestrate and display. That is the correct relationship and consistent with “filings are transformations of approved data.”
- **Single engine routing between regimes.** One filing engine that routes per-client-per-year between MTD IT and legacy SA (rather than two products) is the right instinct and matches “no parallel workflow systems.”
- **Two mappers, one input.** The design has `mtd-it-mapper` and `sa100-mapper` both consuming a single canonical object. The *direction* is correct — projections from one model. The *root object* is wrong (see §2).
- **Idempotency, audit, retries, state machine.** The reliability spine (every outbound call audited, idempotency keys, a single proxy chokepoint, a submission state machine) is regime-agnostic infrastructure and aligns cleanly.
- **Fraud-prevention as a first-class, statutory concern.** Correctly treated as non-negotiable and collected at a single chokepoint. Master-app architecture is fully compatible with this (the `Gov-Vendor-*` headers identify AccountancyOS; the `Gov-Client-*` headers identify the agent/user).

-----

## 2. Where the HMRC spec **conflicts** with the operating model

Honest self-audit. These are real conflicts, not cosmetic.

### 2.1 The canonical model is return-shaped, not financial-model-shaped — **critical**

The spec’s canonical object is `CanonicalTaxYearReturn` — keyed by tax year, structured as self-employment/property/dividends/etc. *return* sections. That is a **filing artefact wearing the costume of a source model.** It encodes the SA/MTD IT view of the world into the supposed single source of truth, which means VAT, CT and RTI cannot cleanly inherit from it, and it quietly makes the tax return the centre.

**Correct model:** the source of truth is the **normalised financial model** derived from `ledger → adjustments → workpapers → approval`. Each tax filing is a **projection** of that model (or, for VAT/RTI, of the ledger/subledger directly). The return shape is an *output*, never the store.

### 2.2 No approval gate between data and submission — **critical**

The spec flows: bookkeeping totals → mapper → submit. There is no `Workpapers → Review → Approval` gate in the data path, and nothing in the schema links a submission back to the approved model version it derived from. This is precisely the form-led failure mode you flagged: the system *can* submit figures that never passed approval.

**Correct model:** a submission must be impossible to create unless it references an immutable `approved_model_version`. The link `approved_model_version → filing` must be enforced in the database, not the frontend. Filings become a read-only transformation of an approved, versioned model.

### 2.3 Entity tree is rooted in HMRC nouns — **structural**

The spec’s top-level tree starts at `business_income_source` / `obligation_period` / `submission`. These are HMRC’s concepts. They belong in the engine as a *submission-tracking layer*, but they must hang off the AccountancyOS spine (`client → service → job → workpaper → approved model`), not replace it. As drafted, the HMRC layer *is* the tree, which biases everything built on top of it.

### 2.4 Implied parallel storage per regime — **latent**

Separate `sa100_submissions` and MTD submission tables are fine **as transport/audit records**. The risk is that they accumulate regime-specific *figures* and quietly become parallel tax data models. They must store only the rendered payload + linkage back to the one approved model — never become the place where income or adjustments live.

### 2.5 “Qualifying income” threshold logic sits in the router, not the model — **minor but real**

Threshold routing (£50k/£30k/£20k) reads gross income. That figure must come *from the financial model*, not be recomputed inside the router from raw ledger data — otherwise you have a second, divergent income calculation. The router should consume a model-derived figure.

-----

## 3. Risks of implementing as currently proposed

|# |Risk                                                   |Severity|Mechanism                                                                                                                                                                             |
|--|-------------------------------------------------------|--------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|R1|**Filing product, not accounting OS**                  |Critical|HMRC-rooted entity tree + return-shaped canonical model bias every downstream decision toward forms-and-submission. The moat (one spine) silently erodes.                             |
|R2|**Parallel tax silos (VAT/SA/CT/MTD)**                 |Critical|Return-shaped canonical model can’t serve VAT/RTI/CT, so each grows its own income/adjustment model. This is the exact outcome that caps valuation.                                   |
|R3|**Unapproved data reaches HMRC**                       |High    |No enforced approval gate means a mapping bug or a user shortcut can submit figures that never passed review — a regulatory and reputational exposure.                                |
|R4|**Per-practice credential sprawl** (if Option B chosen)|High    |Every firm needing its own HMRC developer account, production approval and fraud-prevention sign-off makes onboarding a consultancy project, not a signup. Destroys the platform moat.|
|R5|**Rework after Sprint 2**                              |Medium  |Re-rooting the data model after quarterly submissions are built is far more expensive than fixing it now. The cost of this report is justified purely by avoiding R5.                 |
|R6|**VAT/RTI forced through the wrong gate**              |Medium  |Over-correcting toward “everything downstream of approved annual model” would break periodic taxes. Needs the layered-spine model in §6.                                              |

-----

## 4. Required amendments before Sprint 0

These are gating. The spec should not proceed to build until each is reflected.

1. **Re-root the canonical model.** Replace `CanonicalTaxYearReturn` with the **normalised financial model** as the single source of truth. Tax-return shapes become projections generated by mappers at filing time. Rename to make this unmistakable (e.g. `ApprovedFinancialModel` as the store; `Sa100Projection`, `MtdItProjection` as derived outputs).
1. **Insert and enforce the approval gate.** No `submission` row may exist without a foreign key to an immutable `approved_model_version`. Enforce in Postgres (constraint + trigger), per the standing “DB constraints over frontend checks” rule.
1. **Re-root the entity tree** onto `client → service → job → questionnaire → workpaper → approval → filing`. The HMRC nouns (`business_income_source`, `obligation_period`, `submission`) become a **submission-tracking subtree** beneath `filing`, not the root.
1. **Demote HMRC storage tables to transport/audit only.** Confirm in the schema review that no figure of record lives in a regime-specific table — only rendered payloads, references, and HMRC responses.
1. **Adopt the master-app credential model** (§5) and rewrite the spec’s §2.2/§6 around it.
1. **Adopt the layered-spine filing architecture** (§6) and add the cross-tax consumption diagram to the spec so Claude Code cannot reintroduce silos.
1. **Source the threshold figure from the model**, not a parallel computation in the router.

Only after these are in the spec should Sprint 0 (shared framework + OAuth + fraud prevention + Hello World) begin. Note: Sprint 0 itself contains no tax-data modelling, so once the spec is amended, Sprint 0 can start immediately — the amendments mostly gate Sprints 2+.

-----

## 5. Recommended credential strategy

### Recommendation: **Option A — single master AccountancyOS HMRC software application.** Unambiguous.

This is not a close call, and here is the part my original spec got wrong and why.

**The two things I conflated:**

- **The HMRC software application** (the `client_id`/`client_secret`, the production approval, the fraud-prevention sign-off, the software recognition listing). This identifies *the product*. In HMRC’s model the **software vendor** holds this. For AccountancyOS that is **AccountancyOS, once, centrally.** This is exactly how Xero, QuickBooks, FreeAgent and every other commercial MTD product operate — none of them make each accounting firm register a developer app.
- **The Agent Services Account (ASA / ARN).** This is the *practice’s* regulatory identity as a tax agent, tied to its AML supervision and professional body. **Each practice must hold its own ASA** — AccountancyOS cannot and should not hold this on their behalf. This is unavoidable regardless of credential model.

My error was bundling the ASA requirement (genuinely per-practice) together with the software credentials (genuinely central) and concluding “per-practice.” The correct picture is: **central software app + per-practice ASA, joined by OAuth.** Which is precisely your bullet list:

- AccountancyOS owns the HMRC application ✔
- AccountancyOS owns the software credentials ✔
- Firms authorise via OAuth — *using their own ASA Government Gateway sign-in* ✔
- Tokens stored per practice (against that practice’s ARN) ✔
- Clients linked to practice authorisations ✔

### Comparison against your six required dimensions

|Dimension                           |Option A — Master app                                                                                                             |Option B — App per practice                                                                                             |
|------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------|
|**Compliance / production approval**|One production-approval and fraud-prevention sign-off for the product, maintained centrally. Standard vendor model.               |Every firm runs HMRC’s production-approval gauntlet. Unworkable at scale; no vendor does this.                          |
|**Onboarding**                      |Firm signs up, connects ASA via OAuth in minutes.                                                                                 |Firm must create a developer account, register an app, pass approval before they can file. Consultancy-grade onboarding.|
|**Support**                         |One credential surface to support; token/refresh issues handled centrally.                                                        |N× credential surfaces; every firm’s app is a distinct support burden.                                                  |
|**Scaling**                         |Linear, near-zero marginal onboarding cost. The moat.                                                                             |Each new firm is a project. Growth-throttling.                                                                          |
|**Maintenance**                     |One app to maintain through HMRC version changes and fraud-prevention spec updates.                                               |Every firm’s app must be kept current — practically impossible.                                                         |
|**Liability**                       |AccountancyOS bears the vendor relationship with HMRC for software behaviour (manageable via T&Cs + monitoring; this is the norm).|Liability distributed but at the cost of everything above. Not worth it.                                                |

**Is there a regulatory requirement forcing Option B?** No. The ASA requirement is satisfied per-practice within Option A. Fraud-prevention headers are satisfied by the master app (vendor headers identify AccountancyOS; client headers identify the agent). HMRC’s multiple-agent model (main agent / supporting agent) operates at the ASA level and is fully compatible with a central app. There is no regulatory driver for per-practice applications for a commercial SaaS serving practices.

**One escape hatch to record, not to build now:** a very large enterprise firm may one day insist on its own software credentials for its own governance reasons. Design the token/authorisation layer so an *optional* per-tenant app override is possible later, but ship the master app as the default and only path for the foreseeable roadmap. Do not let this hypothetical justify building Option B’s complexity up front.

-----

## 6. Recommended filing architecture

### 6.1 The spine is the source of truth — filings are projections

```
                         LEDGER  (transaction grain, source of all)
                            │
              ┌─────────────┼───────────────────────────┐
              │             │                            │
        (transaction    Adjustments                 Payroll subledger
         layer taps)        │                       (its own grain)
              │             ▼                            │
              │     Normalised Financial Model           │
              │             │                            │
              │         Workpapers                       │
              │             │                            │
              │           Review                         │
              │             │                            │
              │          Approval  ──►  Approved Model Version (immutable)
              │             │                            │
   ┌──────────┴───┐   ┌─────┴───────────────┐     ┌──────┴──────┐
   ▼              ▼   ▼                     ▼     ▼             ▼
  VAT            SA  MTD IT                CT    RTI         (future)
(periodic,    (annual  (quarterly +    (annual  (per pay
 ledger-      projection) final decl.,  projection) run, sub-
 derived)               projections)              ledger-derived)
```

**The single principle:** there is **one accounting spine**, and each tax engine consumes it **at the layer appropriate to that tax**, after the relevant approval gate. There is no “tax data model.” There is the financial model and the ledger, and filings are projections.

### 6.2 Which layer each tax taps — and why “all downstream of approved annual data” needs nuance

|Tax                |Consumes                                                             |Grain                |Gate                                         |Calculation                                                                      |
|-------------------|---------------------------------------------------------------------|---------------------|---------------------------------------------|---------------------------------------------------------------------------------|
|**Self Assessment**|Approved financial model                                             |Annual               |Full approval                                |HMRC calculates (legacy: HMRC)                                                   |
|**MTD IT**         |Approved financial model (final decl.); model-in-progress (quarterly)|Quarterly + annual   |Quarterly: light review; Final: full approval|HMRC `Individual Calculations`                                                   |
|**Corporation Tax**|Approved financial model → statutory accounts → CT computation       |Annual               |Full approval                                |CT computation engine on approved model (no HMRC calc API; iXBRL/CT600 transport)|
|**VAT**            |**Ledger** (VAT codes per transaction)                               |Quarterly (typically)|Light periodic review — *not* annual approval|Mechanical from ledger                                                           |
|**RTI**            |**Payroll subledger** (employee-level per pay run)                   |Per pay run (FPS/EPS)|Payroll approval per run                     |Payroll engine                                                                   |

This is the refinement to “all filings are downstream of approved accounting data.” For **SA / MTD IT / CT** it is exactly true — they project the approved financial model. For **VAT and RTI** the source is the ledger / payroll subledger at transaction grain, with their *own* lighter, more frequent approval gates. If they were forced behind the annual-accounts approval gate, quarterly VAT and per-run RTI would be architecturally impossible. So:

> **Correct invariant:** every filing is a read-only projection of an *approved, versioned* artefact — but the artefact is layer-appropriate (financial model for income/corp tax; ledger/subledger with periodic approval for VAT/RTI). The ledger remains the single root of all of them.

### 6.3 No duplicated calculations, income models, or adjustments

- **Income** is modelled once, in the financial model. SA and MTD IT both project it; CT projects the company variant. None re-derive income.
- **Adjustments** live once, between ledger and financial model. Every income/corp-tax filing inherits the same adjusted figures.
- **Tax calculation** is never re-implemented for income tax (HMRC calculates). For VAT it is mechanical from the ledger. For CT it is one computation engine on the approved model. There is exactly one place each number is produced.

### 6.4 What this means for the HMRC engine specifically

The HMRC engine from the original spec is **retained in full as the submission/transport/obligation/audit layer** — but it is relocated to hang beneath `filing`, and it is fed *only* by projections of the approved model. It stores payloads, obligations, HMRC references and responses. It stores **no figures of record.** Re-pointing the engine this way is a re-rooting exercise, not a rewrite — the OAuth, fraud-prevention, state-machine and audit work all survive.

-----

## 7. Decisions required from you

1. **Confirm Option A (master app).** I recommend it unambiguously; only you can ratify it as the standing architecture.
1. **Confirm the layered-spine model in §6.2**, specifically that VAT and RTI tap the ledger/subledger with their own periodic gates rather than the annual approval gate. This is the one place I’ve refined your framing and I want explicit agreement before it’s baked in.
1. **Confirm the approval-gate invariant** (no submission without an immutable approved-model-version reference, enforced in Postgres).
1. **Confirm naming** that prevents drift: store = `ApprovedFinancialModel`; outputs = `…Projection`. Naming is load-bearing here — `CanonicalTaxYearReturn` is half of how the spec drifted.
1. **Scope call on CT and RTI for the *spec*** (not the build): include them now as consumers in the architecture so the model is proven against them, even though their build is later. Recommended: yes — proving the model against CT and RTI on paper now is what stops silos later.
1. **Capital Gains** for MTD-IT clients (no MTD endpoint exists): confirm it routes via legacy SA additional pages / the standalone CGT service for now.

-----

## 8. Recommended next action

Amend the spec to reflect §4, §5 and §6, then re-issue it to Claude Code with the entity tree re-rooted and the approval gate enforced. Sprint 0 (framework, OAuth, fraud prevention, Hello World) carries no tax-data modelling and can begin the moment the amended spec lands; the substantive amendments gate Sprint 2 onward. I can produce the amended spec — with the re-rooted data model, the `ApprovedFinancialModel`-centric canonical layer, and the relocated HMRC submission subtree — on your word.
