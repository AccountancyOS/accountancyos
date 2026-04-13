

# Test Accountancy Firm — Implementation Plan

## Login Credentials

A new auth user will be created as the permanent test account:

- **Email:** `test@greenfield-accountants.co.uk`
- **Password:** `Greenfield2026!`
- **Auto-confirm:** Yes (immediate login)

This user will be the **owner** of the new organization. The existing `+1` and `+2` accounts will be added as admin and staff respectively.

---

## Organization & Team

| User | Email | Role |
|------|-------|------|
| Test Owner | test@greenfield-accountants.co.uk | owner |
| Admin User | jamiebshaw1095+1@gmail.com (f6faf632) | admin |
| Staff User | jamiebshaw1095+2@gmail.com (69c80a39) | staff |

Created via `create_organization_with_owner` RPC + `add_org_member` RPC.

---

## Clients (8 — consolidated, no single-purpose clients)

| # | Name | Type | Status | Services Covered |
|---|------|------|--------|-----------------|
| 1 | Margaret Thompson | sa_non_mtd | active | SA Return, Tax Planning |
| 2 | Ravi Patel | sa_mtd | active | SA MTD Quarterly, Tax Planning |
| 3 | Ahmed Hassan | partnership | active | Partnership Return, SA Return |
| 4 | Claire Dubois | cgt | active | CGT 60-day, SA Return |
| 5 | David Wright | sa_non_mtd | active | SA Return, Bookkeeping |
| 6 | Priya Sharma | sa_mtd | pending | SA MTD (onboarding test) |
| 7 | Tom Richards | sa_non_mtd | disengaged | SA Return (disengaged flow) |
| 8 | Robert Kumar | sa_non_mtd | archived | SA Return (archived state) |

Detail records: `client_detail_sa` for SA clients, `client_detail_cgt` for Claire, `client_detail_partnership` for Ahmed.

---

## Companies (4 — consolidated)

| # | Name | Type | Status | Services Covered |
|---|------|------|--------|-----------------|
| 1 | Oakwood Digital Ltd | limited_company | active | CT600, VAT, Annual Accounts, CS01, Payroll, CIS |
| 2 | Riverside Partners LLP | llp | active | LLP Accounts, CS01, VAT |
| 3 | Hope Foundation CIO | charity | active | Charity Accounts, Gift Aid |
| 4 | Nova Tech Solutions Ltd | limited_company | pending | CT600 (onboarding test) |

Oakwood covers VAT + Payroll + CIS in one entity. `client_detail_charity` for Hope Foundation.

---

## Contacts (directors/bookkeepers on companies)

6 contacts across the 4 companies — directors, company secretaries, bookkeepers.

---

## Engagements

~15 engagements linking clients/companies to services with varying frequencies (monthly, quarterly, annually, fixed).

---

## Jobs (12 — spread across all statuses)

| Status | Count | Purpose |
|--------|-------|---------|
| blank | 1 | New job test |
| records_requested | 1 | Waiting for records |
| records_received | 1 | Ready to start |
| accountant_queries | 1 | Query raised |
| client_queries | 1 | Client responding |
| accountant_review | 2 | Review stage |
| client_review | 1 | Client sign-off |
| ready_to_file | 1 | Filing queue |
| completed | 3 | Historical |

Assigned to owner/admin/staff to test assignment views.

---

## Leads (6 — one per pipeline stage)

| Name | Stage | Source | Type |
|------|-------|--------|------|
| James Fletcher | new | website | limited_company |
| Sarah Okonkwo | qualified | referral | sa_non_mtd |
| Mark Davidson | proposal_sent | direct | partnership |
| Hannah Lee | won | referral | sa_mtd |
| Oliver Grant | chasing | ad | limited_company |
| Emily Stone | lost | other | other |

---

## HMRC Authorisations (4)

| Entity | Auth Type | Status |
|--------|-----------|--------|
| Oakwood Digital | vat | active (expires 2027) |
| Oakwood Digital | ct | pending |
| Riverside Partners | vat | active (expiring in 20 days) |
| Margaret Thompson | personal | expired |

---

## Deadlines (8 — mix of states)

Upcoming, overdue, and completed deadlines for SA, VAT, CT600, and CGT across the client/company base.

---

## Invoices (6)

Draft, issued, sent, paid, overdue, and voided — linked to clients/companies.

---

## Filings (5)

Draft, awaiting_approval, approved, submitted, and filed — linked to jobs.

---

## Implementation Steps

1. Create auth user `test@greenfield-accountants.co.uk` with auto-confirm
2. Call `create_organization_with_owner` RPC to create "Greenfield & Co Accountants"
3. Call `add_org_member` RPC twice for admin and staff
4. Insert all seed data via SQL (clients, companies, client_detail_*, contacts, engagements, jobs, leads, HMRC authorisations, deadlines, invoices, filings)
5. All data scoped to the new organization ID

No schema changes needed. Pure data insertion.

