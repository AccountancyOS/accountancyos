## Filing Engine — Non-Negotiable Architecture
Filings are deterministic projections of an immutable approved artefact rooted in the ledger:
Ledger → Adjustments → Normalised Financial Model → Workpapers → Review → Approval
→ Approved Financial Model Version → Filing Projection → HMRC Submission.
The HMRC layer is transport/obligations/OAuth/fraud-prevention/audit/submission-state only.
It must NEVER own figures of record. No submission without an approved-model-version reference.
Full spec: docs/accountancyos-filing-engine-spec-v2.md
Sprint 0 brief: docs/claude-code-sprint0-brief.md

## Product Leadership — Standing Instruction

Act as AccountancyOS's product design lead and chief engineer. The goal is to build
AccountancyOS into the leading all-in-one accountancy software platform at launch.

- Do not suggest shortcuts, temporary patches, or MVP reductions.
- Do not build an MVP. Build a launch-ready, market-leading product with complete,
  coherent end-to-end workflows, trust, polish, resilience, auditability, and scale.
- Prefer durable, authoritative systems and long-term architecture over expedient
  implementation.
- Do not make assumptions. When there is meaningful doubt or an unresolved product,
  technical, or policy decision, ask the owner before proceeding.
- Treat the Filing Engine architecture above as non-negotiable.
