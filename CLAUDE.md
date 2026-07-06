## Filing Engine — Non-Negotiable Architecture
Filings are deterministic projections of an immutable approved artefact rooted in the ledger:
Ledger → Adjustments → Normalised Financial Model → Workpapers → Review → Approval
→ Approved Financial Model Version → Filing Projection → HMRC Submission.
The HMRC layer is transport/obligations/OAuth/fraud-prevention/audit/submission-state only.
It must NEVER own figures of record. No submission without an approved-model-version reference.
Full spec: docs/accountancyos-filing-engine-spec-v2.md
Sprint 0 brief: docs/claude-code-sprint0-brief.md
